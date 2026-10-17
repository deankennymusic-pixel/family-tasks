import type { ReactNode } from "react";

export function Centered({ children }: { children: ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">{children}</main>;
}

export function Spinner() {
  return (
    <span
      role="status"
      aria-label="Loading"
      className="h-8 w-8 animate-spin rounded-full border-[3px] border-neutral-200 border-t-accent"
    />
  );
}
