import type { ListTask } from "./task-list";

// Tasks that failed to save are kept in localStorage so that closing the app
// before a retry succeeds never loses them.
const key = (householdId: string) => `family-tasks:unsaved:${householdId}`;

export function loadUnsaved(householdId: string): ListTask[] {
  try {
    const raw = localStorage.getItem(key(householdId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ListTask[]) : [];
  } catch {
    return [];
  }
}

export function storeUnsaved(householdId: string, tasks: ListTask[]) {
  try {
    if (tasks.length) localStorage.setItem(key(householdId), JSON.stringify(tasks));
    else localStorage.removeItem(key(householdId));
  } catch {
    // Storage full or blocked: the task is still on screen with a retry.
  }
}
