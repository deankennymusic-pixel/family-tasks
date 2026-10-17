"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/format";
import type { Invite, PendingInvite, Profile } from "@/lib/types";

export type HouseholdState =
  | { status: "loading" }
  | { status: "error"; message: string }
  // Signed in, not in a household yet, and someone has invited them.
  | { status: "invited"; invites: Invite[] }
  | {
      status: "ready";
      householdId: string;
      name: string;
      members: Profile[];
      pendingInvites: PendingInvite[];
      // Invites to a different household (e.g. Lu signed up before Dean invited her).
      invites: Invite[];
    };

export function useHousehold(userId: string) {
  const [state, setState] = useState<HouseholdState>({ status: "loading" });

  const load = useCallback(
    async (opts: { createIfNone: boolean }) => {
      const db = supabase();
      try {
        const [membership, invites] = await Promise.all([
          db.from("household_members").select("household_id").eq("user_id", userId).maybeSingle(),
          db.rpc("my_invites"),
        ]);
        if (membership.error) throw membership.error;
        if (invites.error) throw invites.error;
        const myInvites = (invites.data ?? []) as Invite[];

        let householdId: string | undefined = membership.data?.household_id;
        if (!householdId) {
          if (myInvites.length && !opts.createIfNone) {
            setState({ status: "invited", invites: myInvites });
            return;
          }
          const created = await db.rpc("ensure_household");
          if (created.error) throw created.error;
          householdId = created.data as string;
        }

        const [household, members, profiles, pending] = await Promise.all([
          db.from("households").select("name").eq("id", householdId).single(),
          db.from("household_members").select("user_id").eq("household_id", householdId),
          db.from("profiles").select("id,email,display_name,avatar_url"),
          db
            .from("household_invites")
            .select("id,email,created_at")
            .eq("household_id", householdId)
            .is("accepted_at", null)
            .order("created_at"),
        ]);
        for (const r of [household, members, profiles, pending]) if (r.error) throw r.error;

        const memberIds = new Set((members.data ?? []).map((m) => m.user_id as string));
        setState({
          status: "ready",
          householdId,
          name: household.data!.name,
          members: ((profiles.data ?? []) as Profile[]).filter((p) => memberIds.has(p.id)),
          pendingInvites: (pending.data ?? []) as PendingInvite[],
          invites: myInvites,
        });
      } catch (e) {
        setState({ status: "error", message: errorMessage(e) });
      }
    },
    [userId],
  );

  useEffect(() => {
    // Initial fetch from the server; setState happens after the awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load({ createIfNone: false });
  }, [load]);

  const refresh = useCallback(() => load({ createIfNone: false }), [load]);
  const startOwn = useCallback(() => load({ createIfNone: true }), [load]);

  const acceptInvite = useCallback(
    async (inviteId: string) => {
      const { error } = await supabase().rpc("accept_invite", { invite_id: inviteId });
      if (error) throw error;
      await load({ createIfNone: false });
    },
    [load],
  );

  const invite = useCallback(
    async (email: string) => {
      const { error } = await supabase().rpc("invite_member", { invitee_email: email });
      if (error) throw error;
      await load({ createIfNone: false });
    },
    [load],
  );

  const cancelInvite = useCallback(
    async (inviteId: string) => {
      const { error } = await supabase().rpc("cancel_invite", { invite_id: inviteId });
      if (error) throw error;
      await load({ createIfNone: false });
    },
    [load],
  );

  return { state, refresh, startOwn, acceptInvite, invite, cancelInvite };
}
