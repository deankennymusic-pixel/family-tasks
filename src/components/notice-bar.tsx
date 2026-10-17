"use client";

import { useEffect } from "react";
import type { Notice } from "@/hooks/use-tasks";

export function NoticeBar({
  notice,
  onDismiss,
  onRetry,
}: {
  notice: Notice | null;
  onDismiss: () => void;
  onRetry: (op: NonNullable<Notice["retry"]>) => void;
}) {
  // Messages without an action fade on their own; failures wait for the user.
  useEffect(() => {
    if (!notice || notice.retry) return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [notice, onDismiss]);

  if (!notice) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-4 z-30 mx-auto flex max-w-md animate-rise items-center gap-3 rounded-xl bg-neutral-800 py-2 pl-4 pr-2 text-[15px] text-white shadow-lg"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 96px)" }}
    >
      <span className="flex-1">{notice.message}</span>
      {notice.retry && (
        <button
          type="button"
          onClick={() => onRetry(notice.retry!)}
          className="h-10 rounded-lg px-3 font-medium text-[#8ab4f8] active:bg-white/10"
        >
          Retry
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-300 active:bg-white/10"
      >
        ✕
      </button>
    </div>
  );
}
