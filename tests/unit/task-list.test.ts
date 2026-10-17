import { describe, expect, it } from "vitest";
import { emptyState, splitTasks, taskReducer, type TaskState } from "@/lib/task-list";
import type { Task } from "@/lib/types";

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  household_id: "h",
  title: id,
  created_by: "u",
  completed: false,
  completed_at: null,
  created_at: "2026-10-17T10:00:00Z",
  updated_at: "2026-10-17T10:00:00Z",
  ...over,
});

const reduce = (...actions: Parameters<typeof taskReducer>[1][]) =>
  actions.reduce<TaskState>(taskReducer, emptyState);

describe("taskReducer", () => {
  it("replaces the list on load but keeps tasks not yet saved", () => {
    const s = reduce(
      { type: "loaded", rows: [task("a"), task("b")] },
      { type: "local", task: { ...task("c"), sync: "unsaved" } },
      { type: "loaded", rows: [task("a")] },
    );
    expect(Object.keys(s.tasks).sort()).toEqual(["a", "c"]);
  });

  it("applies realtime inserts and updates", () => {
    const s = reduce(
      { type: "upsert", row: task("a") },
      { type: "upsert", row: task("a", { completed: true, updated_at: "2026-10-17T10:01:00Z" }) },
    );
    expect(s.tasks.a.completed).toBe(true);
  });

  it("ignores an older echo of a task", () => {
    const s = reduce(
      { type: "upsert", row: task("a", { title: "new", updated_at: "2026-10-17T10:05:00Z" }) },
      { type: "upsert", row: task("a", { title: "old", updated_at: "2026-10-17T10:01:00Z" }) },
    );
    expect(s.tasks.a.title).toBe("new");
  });

  it("lets the server row replace a local unsaved copy", () => {
    const s = reduce(
      { type: "local", task: { ...task("a"), sync: "saving" } },
      { type: "upsert", row: task("a", { updated_at: "2026-10-17T09:00:00Z" }) },
    );
    expect(s.tasks.a.sync).toBeUndefined();
  });

  it("removes deleted tasks and ignores unknown ids", () => {
    const s = reduce({ type: "loaded", rows: [task("a")] }, { type: "remove", id: "a" }, { type: "remove", id: "zz" });
    expect(s.tasks).toEqual({});
  });

  it("does not resurrect a task whose delete is in flight", () => {
    const s = reduce(
      { type: "loaded", rows: [task("a")] },
      { type: "remove", id: "a" },
      { type: "deleting", id: "a", on: true },
      { type: "loaded", rows: [task("a")] },
      { type: "upsert", row: task("a", { updated_at: "2026-10-17T11:00:00Z" }) },
    );
    expect(s.tasks.a).toBeUndefined();
  });
});

describe("splitTasks", () => {
  it("lists active newest first and completed most recently completed first", () => {
    const s = reduce({
      type: "loaded",
      rows: [
        task("old", { created_at: "2026-10-01T00:00:00Z" }),
        task("new", { created_at: "2026-10-02T00:00:00Z" }),
        task("done1", { completed: true, completed_at: "2026-10-03T00:00:00Z" }),
        task("done2", { completed: true, completed_at: "2026-10-04T00:00:00Z" }),
      ],
    });
    const { active, completed } = splitTasks(s);
    expect(active.map((t) => t.id)).toEqual(["new", "old"]);
    expect(completed.map((t) => t.id)).toEqual(["done2", "done1"]);
  });
});
