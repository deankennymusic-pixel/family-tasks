// An in-memory stand-in for the Supabase REST and Realtime APIs, wired into
// Playwright browser contexts. It implements just enough PostgREST, RPC and
// Phoenix-channel behaviour to drive the app's real client code, so two
// browsers can be tested side by side. Security is covered separately by the
// database tests against real Postgres.
import type { BrowserContext, Route, WebSocketRoute } from "@playwright/test";
import { randomUUID } from "node:crypto";

export const SUPABASE_URL = "http://127.0.0.1:54399";

type Row = Record<string, unknown>;
type User = { id: string; email: string; name: string };

const taskColumns = [
  { name: "id", type: "uuid" },
  { name: "household_id", type: "uuid" },
  { name: "title", type: "text" },
  { name: "created_by", type: "uuid" },
  { name: "completed", type: "bool" },
  { name: "completed_at", type: "timestamptz" },
  { name: "created_at", type: "timestamptz" },
  { name: "updated_at", type: "timestamptz" },
];

function fakeJwt(user: User) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, email: user.email, role: "authenticated", exp })}.sig`;
}

type Socket = { ws: WebSocketRoute; channels: Map<string, { ids: { id: number; event: string; filter?: string }[] }> };

export class FakeSupabase {
  profiles: Row[] = [];
  households: Row[] = [];
  members: Row[] = [];
  invites: Row[] = [];
  tasks: Row[] = [];
  sockets: Socket[] = [];
  // Number of upcoming task writes to fail, to exercise error handling.
  failNextTaskWrites = 0;

  user(name: string, email: string): User {
    const user = { id: randomUUID(), email, name };
    this.profiles.push({ id: user.id, email, display_name: name, avatar_url: null });
    return user;
  }

  async attach(context: BrowserContext, user: User) {
    const session = {
      access_token: fakeJwt(user),
      refresh_token: "refresh",
      token_type: "bearer",
      expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: user.id, email: user.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} },
    };
    await context.addInitScript((s) => {
      if (!localStorage.getItem("sb-127-auth-token")) localStorage.setItem("sb-127-auth-token", s);
    }, JSON.stringify(session));
    await context.route(`${SUPABASE_URL}/**`, (route) => this.handle(route, user));
    await context.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => this.socket(ws));
  }

  private householdOf(userId: string) {
    return this.members.find((m) => m.user_id === userId)?.household_id as string | undefined;
  }

  private visible(table: string, user: User): Row[] {
    const hid = this.householdOf(user.id);
    switch (table) {
      case "tasks":
        return this.tasks.filter((t) => t.household_id === hid);
      case "households":
        return this.households.filter((h) => h.id === hid);
      case "household_members":
        return this.members.filter((m) => m.household_id === hid);
      case "household_invites":
        return this.invites.filter((i) => i.household_id === hid || i.email === user.email);
      case "profiles": {
        const ids = new Set(this.members.filter((m) => m.household_id === hid).map((m) => m.user_id));
        return this.profiles.filter((p) => p.id === user.id || ids.has(p.id));
      }
      default:
        throw new Error(`unknown table ${table}`);
    }
  }

  private async handle(route: Route, user: User) {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (rpc) return json(200, this.rpc(rpc[1], req.postDataJSON() ?? {}, user));

    const table = url.pathname.match(/^\/rest\/v1\/(\w+)$/)?.[1];
    if (!table) return json(404, { message: "not found" });

    const filters = [...url.searchParams].filter(([k]) => !["select", "order", "columns"].includes(k));
    const matches = (row: Row) =>
      filters.every(([k, v]) => (v === "is.null" ? row[k] == null : v.startsWith("eq.") ? String(row[k]) === v.slice(3) : true));
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const respond = (rows: Row[]) =>
      single ? (rows.length === 1 ? json(200, rows[0]) : json(406, { code: "PGRST116", message: "not one row" })) : json(200, rows);

    if (table === "tasks" && req.method() !== "GET" && this.failNextTaskWrites > 0) {
      this.failNextTaskWrites--;
      return route.abort("internetdisconnected");
    }

    const now = new Date().toISOString();
    switch (req.method()) {
      case "GET":
        return respond(this.visible(table, user).filter(matches));
      case "POST": {
        const body = req.postDataJSON() as Row;
        if (this.tasks.some((t) => t.id === body.id)) return json(409, { code: "23505", message: "duplicate key" });
        const row: Row = {
          id: body.id ?? randomUUID(),
          household_id: body.household_id,
          title: String(body.title).trim(),
          created_by: user.id,
          completed: false,
          completed_at: null,
          created_at: now,
          updated_at: now,
        };
        this.tasks.push(row);
        this.broadcast("INSERT", row, {});
        return respond([row]);
      }
      case "PATCH": {
        const changes = req.postDataJSON() as Row;
        const rows = this.visible(table, user).filter(matches);
        for (const row of rows) {
          const old = { ...row };
          if (changes.completed !== undefined && changes.completed !== row.completed) {
            row.completed_at = changes.completed ? now : null;
          }
          Object.assign(row, changes, { updated_at: now });
          this.broadcast("UPDATE", row, old);
        }
        return respond(rows);
      }
      case "DELETE": {
        const rows = this.visible(table, user).filter(matches);
        this.tasks = this.tasks.filter((t) => !rows.includes(t));
        for (const row of rows) this.broadcast("DELETE", {}, { id: row.id });
        return route.fulfill({ status: 204 });
      }
    }
    return json(405, { message: "unsupported" });
  }

  private rpc(name: string, args: Row, user: User): unknown {
    const hid = this.householdOf(user.id);
    switch (name) {
      case "ensure_household": {
        if (hid) return hid;
        const id = randomUUID();
        this.households.push({ id, name: "Our Tasks", created_by: user.id });
        this.members.push({ household_id: id, user_id: user.id });
        return id;
      }
      case "my_invites":
        return this.invites
          .filter((i) => i.email === user.email && !i.accepted_at && i.household_id !== hid)
          .map((i) => {
            const inviter = this.profiles.find((p) => p.id === i.invited_by);
            return {
              id: i.id,
              household_id: i.household_id,
              household_name: "Our Tasks",
              inviter_name: inviter?.display_name,
              inviter_avatar: null,
            };
          });
      case "invite_member": {
        const id = randomUUID();
        const email = String(args.invitee_email).trim().toLowerCase();
        this.invites.push({ id, household_id: hid, email, invited_by: user.id, created_at: new Date().toISOString(), accepted_at: null });
        return id;
      }
      case "accept_invite": {
        const inv = this.invites.find((i) => i.id === args.invite_id && i.email === user.email);
        if (!inv) throw new Error("invite not found");
        this.members = this.members.filter((m) => m.user_id !== user.id);
        this.members.push({ household_id: inv.household_id, user_id: user.id });
        inv.accepted_at = new Date().toISOString();
        return inv.household_id;
      }
      case "cancel_invite":
        this.invites = this.invites.filter((i) => i.id !== args.invite_id);
        return null;
    }
    throw new Error(`unknown rpc ${name}`);
  }

  // Phoenix channel protocol (vsn 2.0.0): [join_ref, ref, topic, event, payload].
  private socket(ws: WebSocketRoute) {
    const socket: Socket = { ws, channels: new Map() };
    this.sockets.push(socket);
    ws.onMessage((raw) => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(String(raw));
      const reply = (response: unknown) => ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response }]));
      if (event === "phx_join") {
        const ids = (payload.config.postgres_changes as { event: string; schema: string; table: string; filter?: string }[]).map(
          (c, i) => ({ ...c, id: i + 1 }),
        );
        socket.channels.set(topic, { ids });
        reply({ postgres_changes: ids });
      } else if (event === "phx_leave") {
        socket.channels.delete(topic);
        reply({});
      } else {
        reply({});
      }
    });
    ws.onClose(() => {
      this.sockets = this.sockets.filter((s) => s !== socket);
    });
  }

  private broadcast(type: "INSERT" | "UPDATE" | "DELETE", record: Row, oldRecord: Row) {
    const hid = (record.household_id ?? oldRecord.household_id) as string | undefined;
    for (const { ws, channels } of this.sockets) {
      for (const [topic, { ids }] of channels) {
        const matching = ids
          .filter((b) => b.event === "*" || b.event === type)
          .filter((b) => !b.filter || (type !== "DELETE" && b.filter === `household_id=eq.${hid}`))
          .map((b) => b.id);
        if (!matching.length) continue;
        const data = {
          schema: "public",
          table: "tasks",
          commit_timestamp: new Date().toISOString(),
          type,
          columns: taskColumns,
          record,
          old_record: oldRecord,
          errors: null,
        };
        ws.send(JSON.stringify([null, null, topic, "postgres_changes", { ids: matching, data }]));
      }
    }
  }
}
