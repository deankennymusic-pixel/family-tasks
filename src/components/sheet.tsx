"use client";

import { useEffect, useState, type ReactNode } from "react";

// How far the on-screen keyboard covers the layout viewport (iOS Safari
// doesn't resize fixed elements for it).
function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setInset(0);
    };
  }, [active]);
  return inset;
}

// A bottom sheet. It stays mounted while closed so an input inside it can be
// focused in the same tap that opens it, which is what makes iOS raise the
// keyboard.
export function Sheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const inset = useKeyboardInset(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
      inert={!open}
    >
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`absolute inset-x-0 mx-auto max-w-xl rounded-t-3xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.12)] transition-transform duration-200 ease-out ${
          open ? "translate-y-0" : "translate-y-[110%]"
        }`}
        style={{ bottom: inset, paddingBottom: inset ? 0 : "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-neutral-300" />
        {children}
      </div>
    </div>
  );
}
