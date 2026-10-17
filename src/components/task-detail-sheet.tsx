"use client";

import { useState } from "react";
import { Sheet } from "./sheet";
import { Avatar } from "./avatar";
import { displayName, relativeTime } from "@/lib/format";
import type { ListTask } from "@/lib/task-list";
import type { Profile } from "@/lib/types";

// Mounted with a key per task, so the draft starts from that task's title.
export function TaskDetailSheet({
  task,
  creator,
  onClose,
  onSave,
  onDelete,
}: {
  task: ListTask | null;
  creator: Profile | null;
  onClose: () => void;
  onSave: (task: ListTask, changes: { title?: string; completed?: boolean }) => void;
  onDelete: (task: ListTask) => void;
}) {
  const [draft, setDraft] = useState(task?.title ?? "");

  const titleChange = () =>
    task && draft.trim() && draft.trim() !== task.title ? { title: draft.trim() } : {};

  const close = () => {
    const changes = titleChange();
    if (task && changes.title) onSave(task, changes);
    onClose();
  };

  return (
    <Sheet open={task !== null} onClose={close} label="Task details">
      {task && (
        <div className="px-5 pb-5 pt-3">
          <div className="flex items-start justify-between gap-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/\n/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  close();
                }
              }}
              aria-label="Task title"
              maxLength={500}
              rows={2}
              enterKeyHint="done"
              className={`min-h-[3.5rem] flex-1 resize-none bg-transparent py-2 text-[22px] leading-snug text-ink outline-none ${
                task.completed ? "text-neutral-500 line-through" : ""
              }`}
            />
            <button
              type="button"
              onClick={() => {
                onDelete(task);
                onClose();
              }}
              aria-label="Delete task"
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-600 active:bg-neutral-100"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
                <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm4 2v8h1.5v-8H10zm3.5 0v8H15v-8h-1.5z" />
              </svg>
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3 text-[14px] text-neutral-600">
            <Avatar name={displayName(creator)} src={creator?.avatar_url} size={24} />
            <span>
              Added by {creator ? displayName(creator) : "a former member"} · {relativeTime(task.created_at)}
              {task.sync && <span className="text-danger"> · not saved yet</span>}
            </span>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                onSave(task, { ...titleChange(), completed: !task.completed });
                onClose();
              }}
              className="h-11 rounded-full px-4 text-[15px] font-medium text-accent active:bg-accent/10"
            >
              {task.completed ? "Mark uncompleted" : "Mark completed"}
            </button>
            <button
              type="button"
              onClick={close}
              className="h-11 rounded-full bg-accent px-6 text-[15px] font-medium text-white active:bg-accent/90"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
