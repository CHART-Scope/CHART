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
  "maternal-health",
  "mother-baby",
  "baby",
  "pregnant-woman",
  "newborn",
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
        <symbol id="ic-maternal-health" viewBox="0 0 24 24">
          <circle
            cx="8.7"
            cy="5.6"
            r="2.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle
            cx="14.8"
            cy="10.5"
            r="1.7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M4.4 20v-5.1c0-3.3 1.8-5.6 4.3-5.6 1.7 0 3 1 3.7 2.5m-5.7.8c1 3.3 3.3 5 6.7 5 3.1 0 5.3-1.5 6.2-4.4M11 13.9c.8-1.2 1.9-1.8 3.4-1.8 2.4 0 4.1 1.8 4.1 4.3V20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
        {/*
          Solid-fill silhouettes used by the FillFigure component and the
          IconArray. Drawn as a compound path so a single fill covers the
          mother's outline plus the baby head bulge on her chest — one
          silhouette, no seams.
        */}
        {/*
          Mother-baby: mother head + shoulders/dress silhouette, with a
          smaller baby head cradled on her chest. All shapes fill with
          currentColor so they merge into a single solid silhouette.
        */}
        <symbol id="ic-mother-baby" viewBox="0 0 24 24">
          <circle cx="12" cy="4.3" r="2.5" fill="currentColor" />
          <path
            fill="currentColor"
            d="M8.5 8.2c-1.9 0-3.2 1.4-3.2 3.3v1.7c-.9.3-1.5 1.1-1.5 2v6.6h16.4v-6.6c0-.9-.6-1.7-1.5-2v-1.7c0-1.9-1.3-3.3-3.2-3.3H8.5Z"
          />
          <circle cx="9.4" cy="11.4" r="1.7" fill="currentColor" />
        </symbol>
        {/*
          Baby: round head + small torso, faint arm bumps at the sides,
          feet visible at the base. Also single-color merged silhouette.
        */}
        <symbol id="ic-baby" viewBox="0 0 24 24">
          <circle cx="12" cy="6.5" r="3" fill="currentColor" />
          <path
            fill="currentColor"
            d="M8.5 11.3c-1.2 0-2.2 1-2.2 2.2v2.6c-.6.2-1 .8-1 1.4V21h4.3v-2.6c.2.1.4.1.6.1h3.6c.2 0 .4 0 .6-.1V21h4.3v-3.5c0-.6-.4-1.2-1-1.4v-2.6c0-1.2-1-2.2-2.2-2.2H8.5Z"
          />
          <circle cx="10.4" cy="21.6" r="1.1" fill="currentColor" />
          <circle cx="13.6" cy="21.6" r="1.1" fill="currentColor" />
        </symbol>
        {/*
          Pregnant woman: head + torso silhouette with a rounded baby-bump
          on the front. Native aspect (39×90) is preserved so the pictogram
          renders tall-and-narrow inside a square cell, matching the design
          mockup.
        */}
        <symbol id="ic-pregnant-woman" viewBox="0 0 39 90">
          <path
            fill="currentColor"
            d="M12.3302 20.3C17.9359 20.3 22.4802 15.7557 22.4802 10.15C22.4802 4.54431 17.9359 0 12.3302 0C6.72448 0 2.18018 4.54431 2.18018 10.15C2.18018 15.7557 6.72448 20.3 12.3302 20.3Z"
          />
          <path
            fill="currentColor"
            d="M25.79 38.7803C25.4965 38.7528 25.2239 38.6165 25.0259 38.3981C24.8278 38.1797 24.7187 37.8951 24.72 37.6003C24.7616 34.3026 23.5137 31.1191 21.2422 28.7282C18.9708 26.3372 15.8554 24.9278 12.56 24.8003C10.9205 24.7751 9.29229 25.0761 7.77015 25.6859C6.24802 26.2956 4.86229 27.2019 3.69357 28.352C2.52484 29.5021 1.59644 30.8731 0.962345 32.3853C0.328255 33.8974 0.00113212 35.5206 0 37.1603V64.4003C0 65.0103 0.242321 65.5953 0.673655 66.0266C1.10499 66.458 1.69 66.7003 2.3 66.7003H6.62V87.6103C6.61736 87.9219 6.67645 88.2309 6.79387 88.5196C6.91129 88.8082 7.08471 89.0707 7.30412 89.292C7.52353 89.5133 7.78459 89.6889 8.07223 89.8087C8.35987 89.9286 8.66839 89.9903 8.98 89.9903H15.68C16.3059 89.9903 16.9062 89.7416 17.3488 89.2991C17.7914 88.8565 18.04 88.2562 18.04 87.6303V66.7003H24.29C27.9413 66.7413 31.4693 65.3811 34.148 62.8995C36.8267 60.418 38.4523 57.004 38.69 53.3603C38.8514 49.7313 37.596 46.1817 35.189 43.4611C32.7819 40.7406 29.4116 39.0621 25.79 38.7803Z"
          />
        </symbol>
        {/*
          Newborn: head + body with arms outstretched and knees drawn up.
          Native aspect (51×77) is preserved so the pictogram scales
          proportionally inside a square cell.
        */}
        <symbol id="ic-newborn" viewBox="0 0 51 77">
          <path
            fill="currentColor"
            d="M49.575 43.7C50.875 42.4 50.875 40.3 49.575 39L40.975 30.4C39.675 29.1 37.075 28 35.275 28H15.275C13.475 28 10.875 29.1 9.575 30.4L0.975 39C-0.325 40.3 -0.325 42.4 0.975 43.7C2.275 45 4.375 45 5.675 43.7L10.675 38.7C11.775 37.6 13.575 38.4 13.575 39.9V52.2C13.575 53.1 13.175 53.9 12.575 54.6L7.175 60C4.575 62.6 4.575 66.8 7.175 69.4L13.475 75.7C14.775 77 16.875 77 18.175 75.7C19.475 74.4 19.475 72.3 18.175 71L14.275 67C12.975 65.7 12.975 63.6 14.275 62.3L17.575 59C18.175 58.4 19.075 58 19.975 58H30.575C31.475 58 32.275 58.4 32.975 59L36.275 62.3C37.575 63.6 37.575 65.7 36.275 67L32.375 70.9C31.075 72.2 31.075 74.3 32.375 75.6C33.675 76.9 35.775 76.9 37.075 75.6L40.975 71.7C44.875 67.8 44.875 61.4 40.975 57.6L37.875 54.5C37.275 53.9 36.875 53 36.875 52.1V39.9C36.875 38.4 38.675 37.6 39.775 38.7L44.775 43.7C46.175 45 48.275 45 49.575 43.7Z"
          />
          <path
            fill="currentColor"
            d="M25.2747 0C18.8747 0 13.5747 5.2 13.5747 11.7C13.5747 18.1 18.7747 23.4 25.2747 23.4C31.6747 23.4 36.9747 18.2 36.9747 11.7C36.9747 5.2 31.6747 0 25.2747 0Z"
          />
        </symbol>
      </defs>
    </svg>
  );
}
