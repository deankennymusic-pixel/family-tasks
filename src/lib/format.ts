import type { Profile } from "./types";

export function displayName(p: Pick<Profile, "display_name" | "email"> | null | undefined): string {
  if (!p) return "Someone";
  return p.display_name?.trim() || p.email.split("@")[0];
}

export function firstName(p: Pick<Profile, "display_name" | "email"> | null | undefined): string {
  return displayName(p).split(/\s+/)[0];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - Date.parse(iso)) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Supabase/PostgREST errors carry a message; network failures surface as
// TypeError("Failed to fetch") or similar.
export function errorMessage(error: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "You're offline";
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    if (/fetch|network|load failed/i.test(error.message)) return "Couldn't reach the server";
    return error.message;
  }
  return "Something went wrong";
}
