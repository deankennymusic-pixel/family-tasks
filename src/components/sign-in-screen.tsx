"use client";

import { useState } from "react";
import { GoogleLogo } from "./google-logo";
import { AppMark } from "./app-mark";

export function SignInScreen({ onSignIn, error }: { onSignIn: () => Promise<void>; error: string | null }) {
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <AppMark size={72} />
      <h1 className="mt-6 text-[28px] text-ink">Tasks</h1>
      <p className="mt-2 text-[16px] text-neutral-600">One shared list for the whole household.</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onSignIn();
          // On success the page navigates to Google; this only runs on failure.
          setBusy(false);
        }}
        className="mt-10 flex h-12 items-center gap-3 rounded-full border border-neutral-300 bg-white px-6 text-[16px] font-medium text-ink shadow-sm active:bg-neutral-50 disabled:opacity-60"
      >
        <GoogleLogo />
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && (
        <p role="alert" className="mt-4 max-w-xs text-[14px] text-danger">
          {error}
        </p>
      )}
    </main>
  );
}
