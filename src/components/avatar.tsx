/* eslint-disable @next/next/no-img-element -- remote Google avatars, tiny and not worth optimising */
import { initials } from "@/lib/format";

const palette = ["#1a73e8", "#188038", "#e37400", "#a142f4", "#d93025", "#007b83"];

export function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  const color = palette[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % palette.length];
  return src ? (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      className="shrink-0 rounded-full bg-neutral-200 object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-medium text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
    >
      {initials(name)}
    </span>
  );
}
