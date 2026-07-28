/**
 * Icon symbol set for CHART. Rendered once (in AppRoot / Sprite),
 * referenced via <Icon name="..." />.
 * Icons match the prototype: outline strokes, currentColor, 24×24 grid.
 */
export const ICON_NAMES = [
  "info-circle",
  "book",
  "users",
  "settings",
  "bookmark",
  "arrow-right",
  "arrow-left",
  "arrow-down",
  "play",
  "sun",
  "shade",
  "stethoscope",
  "alert-triangle",
  "building",
  "bus",
  "leaf",
  "policy",
  "chevron-down",
  "cloud-storm",
  "paw",
  "plant",
  "building-community",
  "droplet",
  "bolt",
  "heart-handshake",
  "dots",
  "check",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export function IconSprite() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden
      style={{ position: "absolute", overflow: "hidden" }}
    >
      <defs>
        <symbol id="ic-info-circle" viewBox="0 0 24 24">
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <line
            x1="12"
            y1="11"
            x2="12"
            y2="16.2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="12" cy="8" r="0.9" fill="currentColor" />
        </symbol>
        <symbol id="ic-book" viewBox="0 0 24 24">
          <path
            d="M12 6.2C10.2 4.9 8 4.2 5.5 4.2c-.8 0-1.5.7-1.5 1.5v12c0 .8.7 1.5 1.5 1.5 2.5 0 4.7.7 6.5 2 1.8-1.3 4-2 6.5-2 .8 0 1.5-.7 1.5-1.5v-12c0-.8-.7-1.5-1.5-1.5-2.5 0-4.7.7-6.5 2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line
            x1="12"
            y1="6.2"
            x2="12"
            y2="20"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="ic-users" viewBox="0 0 24 24">
          <circle
            cx="9"
            cy="8"
            r="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M3.5 19c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M16 8.2a2.7 2.7 0 1 1-1.4-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            d="M15.5 13.9c2.6.3 4.6 2.4 4.6 5.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="ic-settings" viewBox="0 0 24 24">
          <circle
            cx="12"
            cy="12"
            r="3.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M19.3 13.4a7.4 7.4 0 0 0 0-2.8l1.9-1.4-1.9-3.2-2.2.8a7.3 7.3 0 0 0-2.4-1.4L14.3 3H9.7l-.4 2.4a7.3 7.3 0 0 0-2.4 1.4l-2.2-.8-1.9 3.2 1.9 1.4a7.4 7.4 0 0 0 0 2.8l-1.9 1.4 1.9 3.2 2.2-.8c.7.6 1.5 1.1 2.4 1.4l.4 2.4h4.6l.4-2.4c.9-.3 1.7-.8 2.4-1.4l2.2.8 1.9-3.2-1.9-1.4Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="ic-bookmark" viewBox="0 0 24 24">
          <path
            d="M6.5 4h11v16l-5.5-3.8L6.5 20Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="ic-arrow-right" viewBox="0 0 24 24">
          <line
            x1="4"
            y1="12"
            x2="18.6"
            y2="12"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M13.2 6.2 19 12l-5.8 5.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="ic-arrow-left" viewBox="0 0 24 24">
          <line
            x1="20"
            y1="12"
            x2="5.4"
            y2="12"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M10.8 6.2 5 12l5.8 5.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="ic-arrow-down" viewBox="0 0 24 24">
          <line
            x1="12"
            y1="4"
            x2="12"
            y2="18.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M6.2 13.2 12 19l5.8-5.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="ic-play" viewBox="0 0 24 24">
          <path
            d="M8.2 5.3v13.4l11-6.7Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="ic-sun" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="12" y1="1.5" x2="12" y2="4.2" />
            <line x1="12" y1="19.8" x2="12" y2="22.5" />
            <line x1="1.5" y1="12" x2="4.2" y2="12" />
            <line x1="19.8" y1="12" x2="22.5" y2="12" />
            <line x1="4.4" y1="4.4" x2="6.3" y2="6.3" />
            <line x1="17.7" y1="17.7" x2="19.6" y2="19.6" />
            <line x1="4.4" y1="19.6" x2="6.3" y2="17.7" />
            <line x1="17.7" y1="6.3" x2="19.6" y2="4.4" />
          </g>
        </symbol>
        <symbol id="ic-shade" viewBox="0 0 24 24">
          <path d="M3 12a9 9 0 0 1 18 0Z" fill="currentColor" />
          <line
            x1="12"
            y1="12"
            x2="12"
            y2="21"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <line
            x1="3"
            y1="12"
            x2="21"
            y2="12"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="ic-stethoscope" viewBox="0 0 24 24">
          <path
            d="M6.5 4v5a3.7 3.7 0 0 0 7.4 0V4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M10.2 12.5v1.8a4.6 4.6 0 0 0 9.2 0v-1.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle
            cx="19.4"
            cy="10.4"
            r="1.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </symbol>
        <symbol id="ic-alert-triangle" viewBox="0 0 24 24">
          <path
            d="M12 3.8 2.8 20h18.4Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <line
            x1="12"
            y1="9.5"
            x2="12"
            y2="14.3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16.9" r="0.9" fill="currentColor" />
        </symbol>
        <symbol id="ic-building" viewBox="0 0 24 24">
          <rect
            x="3.5"
            y="9.5"
            width="7"
            height="10.3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <rect
            x="13"
            y="3.8"
            width="7"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </symbol>
        <symbol id="ic-bus" viewBox="0 0 24 24">
          <rect
            x="3.5"
            y="5"
            width="17"
            height="11"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <line
            x1="3.5"
            y1="10.3"
            x2="20.5"
            y2="10.3"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <circle
            cx="7.3"
            cy="18.2"
            r="1.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <circle
            cx="16.7"
            cy="18.2"
            r="1.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          />
        </symbol>
        <symbol id="ic-leaf" viewBox="0 0 24 24">
          <path
            d="M19.5 4.3c-9 0-14.7 5.7-14.7 13.9 8.2 0 13.9-5.7 13.9-14.7Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M6 18c1.8-4 5-7.5 9.6-10.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="ic-policy" viewBox="0 0 24 24">
          <path
            d="M6 3.5h9l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <line
            x1="8.5"
            y1="10"
            x2="15.5"
            y2="10"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <line
            x1="8.5"
            y1="13.5"
            x2="15.5"
            y2="13.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <line
            x1="8.5"
            y1="17"
            x2="12.5"
            y2="17"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="ic-chevron-down" viewBox="0 0 24 24">
          <path
            d="M5 8.5 12 15l7-6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="ic-cloud-storm" viewBox="0 0 24 24">
          <path
            d="M7 15h9a4 4 0 0 0 1-7.9A6 6 0 0 0 5.5 8.6 4 4 0 0 0 7 15Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="m11 15-2 4h3l-2 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="ic-paw" viewBox="0 0 24 24">
          <circle cx="7" cy="9" r="1.6" fill="currentColor" />
          <circle cx="12" cy="6" r="1.6" fill="currentColor" />
          <circle cx="17" cy="9" r="1.6" fill="currentColor" />
          <circle cx="5" cy="14" r="1.3" fill="currentColor" />
          <circle cx="19" cy="14" r="1.3" fill="currentColor" />
          <path
            d="M8.5 15c1-2 6-2 7 0 1.4 3-1 5.5-3.5 5.5S7 18 8.5 15Z"
            fill="currentColor"
          />
        </symbol>
        <symbol id="ic-plant" viewBox="0 0 24 24">
          <path
            d="M12 20V9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M12 12c-3 0-5-2-5-5 3 0 5 2 5 5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M12 12c3 0 5-2 5-5-3 0-5 2-5 5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M5 20h14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </symbol>
        <symbol id="ic-building-community" viewBox="0 0 24 24">
          <rect
            x="3"
            y="10"
            width="6"
            height="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <rect
            x="9"
            y="6"
            width="6"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <rect
            x="15"
            y="12"
            width="6"
            height="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </symbol>
        <symbol id="ic-droplet" viewBox="0 0 24 24">
          <path
            d="M12 3s6 6.5 6 10.5A6 6 0 0 1 6 13.5C6 9.5 12 3 12 3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="ic-bolt" viewBox="0 0 24 24">
          <path
            d="M13 3 5 14h5l-1 7 8-11h-5l1-7Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="ic-heart-handshake" viewBox="0 0 24 24">
          <path
            d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="ic-dots" viewBox="0 0 24 24">
          <circle cx="6" cy="12" r="1.5" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <circle cx="18" cy="12" r="1.5" fill="currentColor" />
        </symbol>
        <symbol id="ic-check" viewBox="0 0 24 24">
          <path
            d="m5 12 4.5 4.5L19 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
      </defs>
    </svg>
  );
}
