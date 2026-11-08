// Small inline SVG icons, drawn for Myna (no icon library, nothing borrowed).

type P = { className?: string };
const base = { viewBox: "0 0 24 24", "aria-hidden": true, focusable: false } as const;

export function MynaMark({ className = "size-8" }: P) {
  // A myna in profile: dark body, white wing patch, yellow beak and eye-patch.
  return (
    <svg viewBox="0 0 48 48" aria-hidden focusable={false} className={className}>
      <ellipse cx="22" cy="28" rx="15" ry="12" fill="#1e1b2e" />
      <circle cx="30" cy="17" r="10" fill="#1e1b2e" />
      <path d="M38.5 15.5 L47 19 L38.5 22.5 Z" fill="#f2b705" />
      <path d="M26 14 C27 11.5 30 11 32 12.5 C32.5 15 31 17 28.5 17 C27 17 26 15.8 26 14 Z" fill="#f2b705" />
      <circle cx="30.5" cy="14.5" r="1.7" fill="#1e1b2e" />
      <path d="M12 27 C16 24.5 22 25 26 28 C22 32 16 32.5 12 27 Z" fill="#fffbf2" />
      <path d="M8 36 L3 44 M12 38 L8 46" stroke="#1e1b2e" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M20 38 V44 M25 38 V44" stroke="#c99400" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function FlameIcon({ className = "size-5" }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M12.5 2.5c.4 3.2-1.4 4.6-3 6.5-1.6 1.9-3 3.8-3 6.5a6.5 6.5 0 0 0 13 0c0-2.2-1-3.9-2-5.2-.3 1.3-1 2.2-2 2.7.6-3.6-.3-8.1-3-10.5Z" fill="#e8590c" />
      <path d="M12 21a3.4 3.4 0 0 1-3.4-3.4c0-1.8 1.2-2.9 2.2-4 .5-.6 1-1.2 1.2-2 1.5 1.3 3.4 3.1 3.4 6a3.4 3.4 0 0 1-3.4 3.4Z" fill="#f2b705" />
    </svg>
  );
}

export function BoltIcon({ className = "size-5" }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M13.5 2 5 13.5h6L10 22l9-12h-6.2L13.5 2Z" fill="#f2b705" stroke="#c99400" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function LockIcon({ className = "size-7" }: P) {
  return (
    <svg {...base} className={className}>
      <rect x="5" y="10.5" width="14" height="10.5" rx="2.5" fill="currentColor" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ className = "size-8" }: P) {
  return (
    <svg {...base} className={className}>
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlayIcon({ className = "size-8" }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" />
    </svg>
  );
}

export function StarIcon({ filled, className = "size-4" }: P & { filled: boolean }) {
  return (
    <svg {...base} className={className}>
      <path
        d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.8 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8L12 3Z"
        fill={filled ? "#f2b705" : "none"}
        stroke={filled ? "#c99400" : "currentColor"}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon({ className = "size-5" }: P) {
  return (
    <svg {...base} className={className}>
      <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
