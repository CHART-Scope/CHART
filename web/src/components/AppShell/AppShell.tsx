"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { ActivityDrawer } from "../ActivityDrawer/ActivityDrawer";
import { Icon, type IconName } from "../Icon";
import { Skeleton } from "../Skeleton";
import styles from "./AppShell.module.css";

export type NavItem = {
  id: string;
  label: string;
  /** Real destination, when the entry has one. Present means the item renders
   * as a link, so it can be opened in a new tab, copied, and read by assistive
   * technology as the navigation it actually is. */
  href?: string;
  icon: IconName;
};

type Props = {
  nav: NavItem[];
  activeNav: string;
  /** Called when an entry is chosen. Entries with an `href` navigate on their
   * own (a prefetching `next/link`); this is for callers that also need to
   * react, and for entries without a destination. */
  onNavigate?: (id: string) => void;
  tagline?: string;
  bounded?: boolean;
  children: ReactNode;
  onLogoClick?: () => void;
  userLabel?: string;
  onSignOut?: () => void;
  /** Put the whole sidebar into its skeleton. For callers that render the
   * shell before they know who the user is, and therefore before they know
   * which nav entries that user is allowed to see. */
  loading?: boolean;
};

// Below this the sidebar stops being a column beside the page and becomes a
// drawer over it; 900px is where 220px of chrome plus a readable dashboard
// card stops fitting side by side.
const NARROW_VIEWPORT = "(max-width: 900px)";

export function AppShell({
  nav,
  activeNav,
  onNavigate,
  tagline = "Climate & Health Adaptation and Resilience Tool",
  bounded = false,
  children,
  onLogoClick,
  userLabel,
  onSignOut,
  loading = false,
}: Props) {
  const isNarrow = useMediaQuery(NARROW_VIEWPORT);
  // `null` means "whatever this viewport's default is" — open beside the page
  // on a desktop, closed over it on a phone. Keeping the override separate
  // from the resolved value is what lets a resize re-adopt the new default
  // instead of stranding the user with a choice made at another width.
  const [override, setOverride] = useState<boolean | null>(null);
  const sidebarOpen = override ?? !isNarrow;
  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => {
    setOverride(null);
  }, [isNarrow]);

  useEffect(() => {
    if (!isNarrow || !sidebarOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOverride(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [isNarrow, sidebarOpen]);

  function go(id: string) {
    // A drawer that stays open over the page it just navigated hides the
    // result of the tap.
    if (isNarrow) setOverride(false);
    onNavigate?.(id);
  }

  return (
    <div
      className={[styles.frame, bounded ? styles.bounded : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <a className={styles.skip} href="#app-shell-main">
        Skip to main content
      </a>
      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.menu}
          aria-expanded={sidebarOpen}
          aria-controls="app-shell-nav"
          onClick={() => setOverride(!sidebarOpen)}
        >
          {/* Hand-drawn rather than an entry in the shared icon sprite: the
              sprite is a product vocabulary (hazards, outcomes, places) and a
              chrome affordance does not belong in it. */}
          <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden focusable="false">
            <path
              d="M2 4h12M2 8h12M2 12h12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <span className={styles.srOnly}>
            {sidebarOpen ? "Hide navigation" : "Show navigation"}
          </span>
        </button>
        {onLogoClick ? (
          <button type="button" className={styles.logo} onClick={onLogoClick}>
            CHART
          </button>
        ) : (
          <span className={styles.logo}>CHART</span>
        )}
        <span className={styles.sep} aria-hidden>
          |
        </span>
        <span className={styles.tagline}>{tagline}</span>
        {userLabel ? <span className={styles.account}>{userLabel}</span> : null}
        <button
          type="button"
          className={styles.activityBtn}
          aria-label="Open background work"
          onClick={() => setActivityOpen(true)}
        >
          <Icon name="dots" size={16} />
        </button>
      </header>
      <ActivityDrawer open={activityOpen} onClose={() => setActivityOpen(false)} />
      <div className={styles.body}>
        {/* Inert on desktop (CSS hides it); on a phone it is the tap target
            that dismisses the drawer. */}
        <div
          className={styles.scrim}
          hidden={!sidebarOpen}
          onClick={() => setOverride(false)}
        />
        <nav
          id="app-shell-nav"
          aria-label="Main"
          className={[styles.sidebar, sidebarOpen ? "" : styles.closed]
            .filter(Boolean)
            .join(" ")}
        >
          <ul className={styles.nav}>
            {loading
              ? [0, 1, 2].map((row) => (
                  <li key={row} className={styles.navSkeleton}>
                    <Skeleton
                      className={styles.navShimmer}
                      width={`${70 - row * 10}%`}
                      height="0.9rem"
                    />
                  </li>
                ))
              : nav.map((item) => (
                  <li key={item.id}>
                    <NavEntry
                      item={item}
                      active={activeNav === item.id}
                      onActivate={() => go(item.id)}
                    />
                  </li>
                ))}
          </ul>
          <button
            type="button"
            className={styles.settings}
            onClick={onSignOut}
            disabled={!onSignOut}
          >
            <Icon name="settings" size={16} />
            Sign out
          </button>
        </nav>
        <div className={styles.main}>
          <div className={styles.page} id="app-shell-main" tabIndex={-1}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function NavEntry({
  item,
  active,
  onActivate,
}: {
  item: NavItem;
  active: boolean;
  onActivate: () => void;
}) {
  const className = [styles.navitem, active ? styles.active : ""]
    .filter(Boolean)
    .join(" ");
  const body = (
    <>
      <Icon name={item.icon} size={16} />
      {item.label}
    </>
  );

  if (!item.href) {
    return (
      <button
        type="button"
        className={className}
        aria-current={active ? "page" : undefined}
        onClick={onActivate}
      >
        {body}
      </button>
    );
  }

  // A real link, so new-tab and copy work, and next/link so the destination
  // is prefetched and a plain click is a client-side transition. Link leaves
  // modified clicks to the browser; so does the activation hook.
  return (
    <Link
      href={item.href}
      className={className}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        const modified =
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey;
        if (!modified) onActivate();
      }}
    >
      {body}
    </Link>
  );
}

/**
 * Matches a media query as React state.
 *
 * Read from `matchMedia` on the first client render rather than from an
 * effect: seeding from `false` would open the drawer over the page for a frame
 * on every phone load. The shell is now server-rendered too (the workspace
 * layout draws it while the session is restored), so the server snapshot is
 * used only while hydrating, which keeps hydration consistent.
 */
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
