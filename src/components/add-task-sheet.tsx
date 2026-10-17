"use client";

import { useState, type RefObject } from "react";
import { Sheet } from "./sheet";

export function AddTaskSheet({
  open,
  onClose,
  onSave,
  inputRef,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (title: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [title, setTitle] = useState("");
  const canSave = title.trim().length > 0;

  const close = () => {
    inputRef.current?.blur();
    onClose();
  };

  const save = () => {
    if (!canSave) return;
    onSave(title.trim());
    setTitle("");
    close();
  };

  return (
    <Sheet open={open} onClose={close} label="New task">
      <form
        className="flex items-center gap-2 px-5 pb-4 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New task"
          aria-label="Task title"
          maxLength={500}
          enterKeyHint="done"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-3 text-[17px] text-ink outline-none placeholder:text-neutral-500"
        />
        <button
          type="submit"
          disabled={!canSave}
          className="h-11 rounded-full px-4 text-[15px] font-medium text-accent disabled:text-neutral-400 active:bg-accent/10"
        >
          Save
        </button>
      </form>
    </Sheet>
  );
}
