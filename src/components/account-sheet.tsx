"use client";

import { useState } from "react";
import { Sheet } from "./sheet";
import { Avatar } from "./avatar";
import { displayName, errorMessage } from "@/lib/format";
import type { PendingInvite, Profile } from "@/lib/types";

export function AccountSheet({
  open,
  onClose,
  me,
  members,
  pendingInvites,
  onInvite,
  onCancelInvite,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  me: Profile | undefined;
  members: Profile[];
  pendingInvites: PendingInvite[];
  onInvite: (email: string) => Promise<void>;
  onCancelInvite: (id: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const invite = async () => {
    const value = email.trim();
    if (!value || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await onInvite(value);
      setEmail("");
      setMessage({ text: `Invited ${value.toLowerCase()}. They'll join when they sign in with that Google account.` });
    } catch (e) {
      setMessage({ text: errorMessage(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} label="Account and household">
      <div className="max-h-[80vh] overflow-y-auto px-5 pb-5 pt-4">
        {me && (
          <div className="flex items-center gap-3">
            <Avatar name={displayName(me)} src={me.avatar_url} size={44} />
            <div className="min-w-0">
              <div className="truncate text-[17px] text-ink">{displayName(me)}</div>
              <div className="truncate text-[14px] text-neutral-600">{me.email}</div>
            </div>
          </div>
        )}

        <h2 className="mt-6 text-[13px] font-medium uppercase tracking-wide text-neutral-600">Household</h2>
        <ul className="mt-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <Avatar name={displayName(m)} src={m.avatar_url} size={32} />
              <span className="truncate text-[16px] text-ink">
                {displayName(m)}
                {m.id === me?.id && <span className="text-neutral-500"> (you)</span>}
              </span>
            </li>
          ))}
          {pendingInvites.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-neutral-400 text-neutral-500">
                ?
              </span>
              <span className="min-w-0 flex-1 truncate text-[16px] text-neutral-600">{i.email} · invited</span>
              <button
                type="button"
                onClick={() => onCancelInvite(i.id).catch((e) => setMessage({ text: errorMessage(e), error: true }))}
                className="h-11 rounded-full px-3 text-[14px] text-neutral-600 active:bg-neutral-100"
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>

        <form
          className="mt-3 flex items-center gap-2 rounded-2xl border border-neutral-300 pl-4 pr-1 focus-within:border-accent"
          onSubmit={(e) => {
            e.preventDefault();
            invite();
          }}
        >
          <input
            type="email"
            inputMode="email"
            autoCapitalize="off"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Invite by Google email"
            aria-label="Email address to invite"
            className="min-w-0 flex-1 bg-transparent py-3 text-[16px] text-ink outline-none placeholder:text-neutral-500"
          />
          <button
            type="submit"
            disabled={!email.trim() || busy}
            className="h-11 rounded-full px-4 text-[15px] font-medium text-accent disabled:text-neutral-400 active:bg-accent/10"
          >
            {busy ? "Inviting…" : "Invite"}
          </button>
        </form>
        {message && (
          <p role="status" className={`mt-2 text-[14px] ${message.error ? "text-danger" : "text-neutral-600"}`}>
            {message.text}
          </p>
        )}

        <button
          type="button"
          onClick={onSignOut}
          className="mt-6 h-12 w-full rounded-full border border-neutral-300 text-[15px] font-medium text-ink active:bg-neutral-100"
        >
          Sign out
        </button>
      </div>
    </Sheet>
  );
}
