/** Line icons drawn for the landing page design (lime on charcoal tiles). */

const common = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const PATHS = {
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </>
  ),
  checklist: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="m7.8 12.2 2 2 4.4-4.6" />
      <path d="M7.8 16.2h8.4" />
    </>
  ),
  bars: (
    <>
      <path d="M4 20h16" />
      <rect x="6" y="12.5" width="3" height="7.5" />
      <rect x="10.5" y="8.5" width="3" height="11.5" />
      <rect x="15" y="4.5" width="3" height="15.5" />
    </>
  ),
  map: (
    <>
      <path d="M3.5 6.5 9 4l6 2.5 5.5-2.5v13.5L15 20l-6-2.5-5.5 2.5z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4.5 6v6c0 5 3.4 7.8 7.5 9 4.1-1.2 7.5-4 7.5-9V6Z" />
      <path d="m8.8 12.2 2.2 2.2 4.2-4.4" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5.5 19c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
    </>
  ),
} as const;

type Name = keyof typeof PATHS;

export function LineIcon({ name }: { name: Name }) {
  return <svg {...common}>{PATHS[name]}</svg>;
}

export function ArrowIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...common} width={size} height={size} strokeWidth={2.2}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}
