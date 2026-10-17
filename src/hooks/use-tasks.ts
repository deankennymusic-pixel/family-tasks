"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { emptyState, splitTasks, taskReducer, type ListTask } from "@/lib/task-list";
import { loadUnsaved, storeUnsaved } from "@/lib/unsaved";
import { errorMessage } from "@/lib/format";
import type { Task } from "@/lib/types";

type Changes = Partial<Pick<Task, "title" | "completed">>;

// A failed operation the user can retry from the notice bar.
type RetryOp =
  | { kind: "unsaved" }
  | { kind: "update"; task: ListTask; changes: Changes; label: string }
  | { kind: "delete"; task: ListTask };

export type Notice = { message: string; retry?: RetryOp };

// "live": realtime connected. "connecting": first load or reconnecting.
export type Connection = "connecting" | "live" | "offline";

const DUPLICATE = "23505";

export function useTasks(householdId: string, userId: string) {
  // Start from anything this device couldn't save last time.
  const [state, dispatch] = useReducer(taskReducer, householdId, (hid) => ({
    ...emptyState,
    tasks: Object.fromEntries(loadUnsaved(hid).map((t) => [t.id, { ...t, sync: "unsaved" as const }])),
  }));
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [notice, setNotice] = useState<Notice | null>(null);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Persist anything this device hasn't been able to save yet.
  useEffect(() => {
    storeUnsaved(
      householdId,
      Object.values(state.tasks).filter((t) => t.sync),
    );
  }, [state.tasks, householdId]);

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase()
      .from("tasks")
      .select("*")
      .eq("household_id", householdId);
    if (error) {
      setLoadError(errorMessage(error));
      return;
    }
    setLoadError(null);
    dispatch({ type: "loaded", rows: data as Task[] });
    setLoaded(true);
  }, [householdId]);

  const insert = useCallback(
    async (task: ListTask) => {
      dispatch({ type: "local", task: { ...task, sync: "saving" } });
      const { data, error } = await supabase()
        .from("tasks")
        .insert({ id: task.id, household_id: task.household_id, title: task.title })
        .select()
        .single();
      if (!error) {
        dispatch({ type: "upsert", row: data as Task });
        return true;
      }
      if (error.code === DUPLICATE) {
        // An earlier attempt reached the server after all.
        const existing = await supabase().from("tasks").select("*").eq("id", task.id).maybeSingle();
        if (existing.data) {
          dispatch({ type: "upsert", row: existing.data as Task });
          return true;
        }
      }
      dispatch({ type: "local", task: { ...task, sync: "unsaved" } });
      return false;
    },
    [],
  );

  const retryUnsaved = useCallback(async () => {
    const unsaved = Object.values(stateRef.current.tasks).filter((t) => t.sync === "unsaved");
    for (const t of unsaved) await insert(t);
  }, [insert]);

  // Initial load, then retry anything left unsaved last time. (The screen
  // is keyed by household, so this hook never switches households.)
  useEffect(() => {
    // Initial fetch; state updates happen after the network round trip.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAll().then(retryUnsaved);
  }, [householdId, fetchAll, retryUnsaved]);

  // Realtime: inserts and updates are filtered to this household. Deletes
  // can't be filtered under row level security (only the id is sent), so
  // they're matched against the local list instead.
  useEffect(() => {
    const db = supabase();
    const onChange = (payload: RealtimePostgresChangesPayload<Task>) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as Partial<Task>).id;
        if (id) dispatch({ type: "remove", id });
      } else {
        dispatch({ type: "upsert", row: payload.new as Task });
      }
    };
    const channel = db
      .channel(`tasks:${householdId}`)
      .on<Task>(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks", filter: `household_id=eq.${householdId}` },
        onChange,
      )
      .on<Task>(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks", filter: `household_id=eq.${householdId}` },
        onChange,
      )
      .on<Task>("postgres_changes", { event: "DELETE", schema: "public", table: "tasks" }, onChange)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection("live");
          // Catch up on anything missed while disconnected.
          fetchAll();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnection(navigator.onLine ? "connecting" : "offline");
        }
      });
    return () => {
      db.removeChannel(channel);
    };
  }, [householdId, fetchAll]);

  // Phones suspend backgrounded apps; resync when the app comes back.
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      fetchAll().then(retryUnsaved);
    };
    const online = () => {
      setConnection("connecting");
      resync();
    };
    const offline = () => setConnection("offline");
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [fetchAll, retryUnsaved]);

  const create = useCallback(
    async (title: string) => {
      const now = new Date().toISOString();
      const task: ListTask = {
        id: crypto.randomUUID(),
        household_id: householdId,
        title: title.trim(),
        created_by: userId,
        completed: false,
        completed_at: null,
        created_at: now,
        updated_at: now,
      };
      if (!(await insert(task))) {
        setNotice({ message: `"${task.title}" wasn't saved yet`, retry: { kind: "unsaved" } });
      }
    },
    [householdId, userId, insert],
  );

  // Applies a change optimistically and rolls it back if the server refuses.
  const update = useCallback(
    async (task: ListTask, changes: Changes, label: string) => {
      if (task.sync) {
        // Not on the server yet: change it locally; the retry will send it.
        const next = { ...task, ...changes };
        dispatch({ type: "local", task: next });
        if (task.sync === "unsaved") insert(next);
        return;
      }
      dispatch({
        type: "local",
        task: {
          ...task,
          ...changes,
          completed_at:
            changes.completed === undefined ? task.completed_at : changes.completed ? new Date().toISOString() : null,
        },
      });
      const { data, error } = await supabase().from("tasks").update(changes).eq("id", task.id).select().maybeSingle();
      if (error || !data) {
        if (data === null && !error) {
          // Someone else deleted it meanwhile.
          dispatch({ type: "remove", id: task.id });
          setNotice({ message: "That task was deleted on another device" });
          return;
        }
        dispatch({ type: "local", task });
        setNotice({
          message: `Couldn't ${label}. ${errorMessage(error)}`,
          retry: { kind: "update", task, changes, label },
        });
        return;
      }
      dispatch({ type: "upsert", row: data as Task });
    },
    [insert],
  );

  const toggle = useCallback(
    (task: ListTask) => update(task, { completed: !task.completed }, task.completed ? "reopen the task" : "complete the task"),
    [update],
  );

  const edit = useCallback(
    (task: ListTask, changes: { title?: string; completed?: boolean }) => update(task, changes, "save the change"),
    [update],
  );

  const remove = useCallback(async (task: ListTask) => {
    dispatch({ type: "remove", id: task.id });
    if (task.sync) return; // Never reached the server.
    dispatch({ type: "deleting", id: task.id, on: true });
    const { error } = await supabase().from("tasks").delete().eq("id", task.id);
    dispatch({ type: "deleting", id: task.id, on: false });
    if (error) {
      dispatch({ type: "local", task });
      setNotice({ message: `Couldn't delete "${task.title}". ${errorMessage(error)}`, retry: { kind: "delete", task } });
    }
  }, []);

  const retry = useCallback(
    (op: RetryOp) => {
      setNotice(null);
      if (op.kind === "unsaved") return retryUnsaved();
      if (op.kind === "update") return update(op.task, op.changes, op.label);
      return remove(op.task);
    },
    [retryUnsaved, update, remove],
  );

  const lists = useMemo(() => splitTasks(state), [state]);

  return {
    ...lists,
    loaded,
    loadError,
    connection,
    notice,
    dismissNotice: useCallback(() => setNotice(null), []),
    retry,
    reload: fetchAll,
    create,
    toggle,
    edit,
    remove,
    retryUnsaved,
  };
}
