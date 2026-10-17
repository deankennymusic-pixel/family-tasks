import type { Task } from "./types";

// A task in the list. `sync` marks rows that exist only on this device:
// "saving" while the insert is in flight, "unsaved" after it failed.
export type ListTask = Task & { sync?: "saving" | "unsaved" };

export type TaskState = {
  tasks: Record<string, ListTask>;
  // Deletes in flight, so a refetch can't briefly resurrect them.
  deleting: Record<string, true>;
};

export const emptyState: TaskState = { tasks: {}, deleting: {} };

export type TaskAction =
  | { type: "loaded"; rows: Task[] }
  | { type: "upsert"; row: Task }
  | { type: "local"; task: ListTask }
  | { type: "remove"; id: string }
  | { type: "deleting"; id: string; on: boolean };

const time = (iso: string) => Date.parse(iso) || 0;

export function taskReducer(state: TaskState, action: TaskAction): TaskState {
  switch (action.type) {
    case "loaded": {
      // The server list is authoritative, except for tasks this device
      // hasn't managed to save yet: those are never dropped.
      const tasks: Record<string, ListTask> = {};
      for (const t of Object.values(state.tasks)) {
        if (t.sync) tasks[t.id] = t;
      }
      for (const row of action.rows) {
        if (!state.deleting[row.id]) tasks[row.id] = row;
      }
      return { ...state, tasks };
    }

    case "upsert": {
      const existing = state.tasks[action.row.id];
      if (state.deleting[action.row.id]) return state;
      // Ignore an echo that is older than what we already have.
      if (existing && !existing.sync && time(existing.updated_at) > time(action.row.updated_at)) {
        return state;
      }
      return { ...state, tasks: { ...state.tasks, [action.row.id]: action.row } };
    }

    case "local":
      return { ...state, tasks: { ...state.tasks, [action.task.id]: action.task } };

    case "remove": {
      if (!state.tasks[action.id]) return state;
      const tasks = { ...state.tasks };
      delete tasks[action.id];
      return { ...state, tasks };
    }

    case "deleting": {
      const deleting = { ...state.deleting };
      if (action.on) deleting[action.id] = true;
      else delete deleting[action.id];
      return { ...state, deleting };
    }
  }
}

// Active tasks newest first, completed tasks most recently completed first.
export function splitTasks(state: TaskState): { active: ListTask[]; completed: ListTask[] } {
  const all = Object.values(state.tasks);
  const active = all
    .filter((t) => !t.completed)
    .sort((a, b) => time(b.created_at) - time(a.created_at) || a.id.localeCompare(b.id));
  const completed = all
    .filter((t) => t.completed)
    .sort(
      (a, b) =>
        time(b.completed_at ?? b.updated_at) - time(a.completed_at ?? a.updated_at) ||
        a.id.localeCompare(b.id),
    );
  return { active, completed };
}
