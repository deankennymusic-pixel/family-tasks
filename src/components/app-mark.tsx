// The app icon, drawn inline (same artwork as public/icons).
export function AppMark({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--color-accent)" />
      <circle cx="32" cy="32" r="16" fill="none" stroke="#fff" strokeWidth="4.5" />
      <path d="M24.5 32.5l5 5 10-10.5" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
