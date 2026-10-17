export function Checkbox({
  checked,
  onToggle,
  label,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className="group -m-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-neutral-100 disabled:opacity-40"
    >
      <span
        className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 transition-colors duration-150 ${
          checked ? "border-accent bg-accent" : "border-neutral-500 group-hover:border-neutral-700"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 text-white transition-transform duration-150 ${checked ? "scale-100" : "scale-0"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
    </button>
  );
}
