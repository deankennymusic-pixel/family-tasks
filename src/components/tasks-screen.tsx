"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTasks } from "@/hooks/use-tasks";
import { displayName, errorMessage } from "@/lib/format";
import type { ListTask } from "@/lib/task-list";
import type { Invite, PendingInvite, Profile } from "@/lib/types";
import { AccountSheet } from "./account-sheet";
import { AddTaskSheet } from "./add-task-sheet";
import { Avatar } from "./avatar";
import { Checkbox } from "./checkbox";
import { NoticeBar } from "./notice-bar";
import { Spinner } from "./centered";
import { TaskDetailSheet } from "./task-detail-sheet";

type Props = {
  userId: string;
  householdId: string;
  listName: string;
  members: Profile[];
  profiles: Record<string, Profile>;
  pendingInvites: PendingInvite[];
  invites: Invite[];
  onInvite: (email: string) => Promise<void>;
  onCancelInvite: (id: string) => Promise<void>;
  onAcceptInvite: (id: string) => Promise<void>;
  onOpenAccount: () => void;
  onUnknownMember: () => void;
  onSignOut: () => void;
};

export function TasksScreen(props: Props) {
  const { userId, householdId, listName, profiles } = props;
  const tasks = useTasks(householdId, userId);
  const me = profiles[userId];

  const [adding, setAdding] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const all = useMemo(() => [...tasks.active, ...tasks.completed], [tasks.active, tasks.completed]);
  const selected = all.find((t) => t.id === selectedId) ?? null;
  const closeAdd = useCallback(() => setAdding(false), []);
  const closeDetail = useCallback(() => setSelectedId(null), []);
  const closeAccount = useCallback(() => setAccountOpen(false), []);
  const invite = props.invites[0];

  // A task from someone we don't have a profile for means a new member joined
  // since the household loaded; fetch it once so "Added by" shows their name.
  const lookedUp = useRef(new Set<string>());
  const { onUnknownMember } = props;
  useEffect(() => {
    const unknown = all.map((t) => t.created_by).filter((id): id is string => !!id && !profiles[id] && !lookedUp.current.has(id));
    if (!unknown.length) return;
    unknown.forEach((id) => lookedUp.current.add(id));
    onUnknownMember();
  }, [all, profiles, onUnknownMember]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header
        className="sticky top-0 z-20 flex items-center justify-between bg-white/95 px-4 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <h1 className="py-3.5 text-[22px] text-ink">Tasks</h1>
        <div className="flex items-center gap-1">
          <ConnectionDot state={tasks.connection} />
          <button
            type="button"
            onClick={() => {
              props.onOpenAccount();
              setAccountOpen(true);
            }}
            aria-label="Account and household"
            className="flex h-11 w-11 items-center justify-center rounded-full active:bg-neutral-100"
          >
            <Avatar name={displayName(me)} src={me?.avatar_url} size={32} />
          </button>
        </div>
      </header>

      {invite && (
        <div className="mx-4 mt-2 flex items-center gap-3 rounded-2xl bg-accent/10 p-3 text-[15px] text-ink">
          <Avatar name={invite.inviter_name ?? "?"} src={invite.inviter_avatar} size={32} />
          <span className="flex-1">
            {invite.inviter_name ?? "Someone"} invited you to share their list.
            {joinError && <span className="block text-danger">{joinError}</span>}
          </span>
          <button
            type="button"
            onClick={() => props.onAcceptInvite(invite.id).catch((e) => setJoinError(errorMessage(e)))}
            className="h-10 rounded-full bg-accent px-4 font-medium text-white active:bg-accent/90"
          >
            Join
          </button>
        </div>
      )}

      <main className="flex-1 pb-32">
        <h2 className="px-5 pb-2 pt-3 text-[26px] text-ink">{listName}</h2>

        {!tasks.loaded && !tasks.loadError && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {tasks.loadError && !tasks.loaded && (
          <div className="px-5 py-12 text-center">
            <p className="text-[16px] text-neutral-700">Couldn&apos;t load tasks. {tasks.loadError}.</p>
            <button
              type="button"
              onClick={() => tasks.reload()}
              className="mt-4 h-11 rounded-full px-5 text-[15px] font-medium text-accent active:bg-accent/10"
            >
              Try again
            </button>
          </div>
        )}

        {tasks.loaded && tasks.active.length === 0 && (
          <div className="px-8 py-14 text-center">
            <EmptyIllustration />
            <p className="mt-6 text-[18px] text-ink">
              {tasks.completed.length ? "All done. Nice work!" : "No tasks yet"}
            </p>
            <p className="mt-1 text-[15px] text-neutral-600">Tap + to add something to the family list.</p>
          </div>
        )}

        <ul>
          {tasks.active.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={tasks.toggle} onOpen={setSelectedId} onRetry={tasks.retryUnsaved} />
          ))}
        </ul>

        {tasks.completed.length > 0 && (
          <section className="mt-2 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              aria-expanded={showCompleted}
              className="flex h-14 w-full items-center justify-between px-5 text-[16px] text-ink active:bg-neutral-50"
            >
              <span>Completed ({tasks.completed.length})</span>
              <svg
                viewBox="0 0 24 24"
                className={`h-6 w-6 text-neutral-600 transition-transform ${showCompleted ? "rotate-180" : ""}`}
                fill="currentColor"
                aria-hidden
              >
                <path d="M7.4 8.6L12 13.2l4.6-4.6L18 10l-6 6-6-6z" />
              </svg>
            </button>
            {showCompleted && (
              <ul>
                {tasks.completed.map((t) => (
                  <TaskRow key={t.id} task={t} onToggle={tasks.toggle} onOpen={setSelectedId} onRetry={tasks.retryUnsaved} />
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      <button
        type="button"
        aria-label="Add task"
        onClick={() => {
          setAdding(true);
          // Focus inside the tap so mobile browsers raise the keyboard.
          addInputRef.current?.focus();
        }}
        className="fixed z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-[0_3px_10px_rgba(26,115,232,0.45)] transition-transform active:scale-95"
        style={{
          right: "max(20px, calc((100vw - 36rem) / 2 + 20px))",
          bottom: "calc(env(safe-area-inset-bottom) + 24px)",
        }}
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>
          <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
        </svg>
      </button>

      <NoticeBar notice={tasks.notice} onDismiss={tasks.dismissNotice} onRetry={tasks.retry} />

      <AddTaskSheet open={adding} onClose={closeAdd} onSave={tasks.create} inputRef={addInputRef} />

      <TaskDetailSheet
        key={selected?.id ?? "none"}
        task={selected}
        creator={selected?.created_by ? (profiles[selected.created_by] ?? null) : null}
        onClose={closeDetail}
        onSave={tasks.edit}
        onDelete={tasks.remove}
      />

      <AccountSheet
        open={accountOpen}
        onClose={closeAccount}
        me={me}
        members={props.members}
        pendingInvites={props.pendingInvites}
        onInvite={props.onInvite}
        onCancelInvite={props.onCancelInvite}
        onSignOut={props.onSignOut}
      />
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onOpen,
  onRetry,
}: {
  task: ListTask;
  onToggle: (t: ListTask) => void;
  onOpen: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <li className="flex animate-rise items-center gap-4 pl-5 pr-2">
      <Checkbox
        checked={task.completed}
        onToggle={() => onToggle(task)}
        label={task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
      />
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="min-h-14 min-w-0 flex-1 py-3 pr-3 text-left active:bg-neutral-50"
      >
        <span
          className={`block break-words text-[17px] leading-snug ${
            task.completed ? "text-neutral-500 line-through" : "text-ink"
          }`}
        >
          {task.title}
        </span>
        {task.sync === "saving" && <span className="text-[13px] text-neutral-500">Saving…</span>}
      </button>
      {task.sync === "unsaved" && (
        <button
          type="button"
          onClick={onRetry}
          className="h-11 shrink-0 rounded-full px-3 text-[13px] font-medium text-danger active:bg-red-50"
        >
          Not saved · Retry
        </button>
      )}
    </li>
  );
}

function ConnectionDot({ state }: { state: "connecting" | "live" | "offline" }) {
  if (state === "live") return null;
  return (
    <span role="status" className="flex items-center gap-1.5 px-2 text-[13px] text-neutral-600">
      <span className={`h-2 w-2 rounded-full ${state === "offline" ? "bg-danger" : "animate-pulse bg-amber-500"}`} />
      {state === "offline" ? "Offline" : "Connecting"}
    </span>
  );
}

function EmptyIllustration() {
  return (
    <svg viewBox="0 0 120 120" className="mx-auto h-28 w-28" aria-hidden>
      <circle cx="60" cy="60" r="52" fill="#e8f0fe" />
      <rect x="34" y="36" width="52" height="56" rx="8" fill="#fff" stroke="#c6dafc" strokeWidth="2" />
      <circle cx="46" cy="52" r="5" fill="none" stroke="#1a73e8" strokeWidth="2.5" />
      <rect x="56" y="50" width="22" height="4" rx="2" fill="#c6dafc" />
      <circle cx="46" cy="68" r="5" fill="none" stroke="#1a73e8" strokeWidth="2.5" />
      <rect x="56" y="66" width="16" height="4" rx="2" fill="#c6dafc" />
    </svg>
  );
}
