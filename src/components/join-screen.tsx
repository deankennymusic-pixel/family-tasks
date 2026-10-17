"use client";

import { useState } from "react";
import { Avatar } from "./avatar";
import { Centered } from "./centered";
import { errorMessage } from "@/lib/format";
import type { Invite } from "@/lib/types";

export function JoinScreen({
  invite,
  onAccept,
  onStartOwn,
}: {
  invite: Invite;
  onAccept: (id: string) => Promise<void>;
  onStartOwn: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inviter = invite.inviter_name ?? "Someone";

  return (
    <Centered>
      <Avatar name={inviter} src={invite.inviter_avatar} size={64} />
      <h1 className="mt-6 text-[24px] leading-snug text-ink">
        {inviter} invited you to share
        <br />“{invite.household_name}”
      </h1>
      <p className="mt-2 text-[16px] text-neutral-600">You&apos;ll both see and update the same tasks.</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onAccept(invite.id);
          } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
          }
        }}
        className="mt-8 h-12 w-full max-w-xs rounded-full bg-accent text-[16px] font-medium text-white active:bg-accent/90 disabled:opacity-60"
      >
        {busy ? "Joining…" : "Join"}
      </button>
      <button
        type="button"
        onClick={onStartOwn}
        className="mt-3 h-11 rounded-full px-4 text-[15px] text-neutral-600 active:bg-neutral-100"
      >
        Start my own list instead
      </button>
      {error && (
        <p role="alert" className="mt-3 text-[14px] text-danger">
          {error}
        </p>
      )}
    </Centered>
  );
}
