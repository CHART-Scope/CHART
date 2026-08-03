"use client";

import { useState, type ReactNode } from "react";

import { ActivityDrawer } from "../ActivityDrawer";
import { Icon, type IconName } from "../Icon";
import styles from "./AppShell.module.css";

export type NavItem = {
  id: string;
  label: string;
  icon: IconName;
};

type Props = {
  nav: NavItem[];
  activeNav: string;
  onNavigate: (id: string) => void;
  tagline?: string;
  bounded?: boolean;
  children: ReactNode;
  onLogoClick?: () => void;
  userLabel?: string;
  onSignOut?: () => void;
};

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
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const toggle = () => (onLogoClick ? onLogoClick() : setCollapsed((c) => !c));
  return (
    <div
      className={[styles.frame, bounded ? styles.bounded : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.topbar}>
        <button type="button" className={styles.logo} onClick={toggle}>
          CHART
        </button>
        <span className={styles.sep}>|</span>
        <span className={styles.tagline}>{tagline}</span>
        {userLabel ? <span className={styles.account}>{userLabel}</span> : null}
        <button
          type="button"
          className={styles.activityBtn}
          aria-label="Open activity log"
          onClick={() => setActivityOpen(true)}
        >
          <Icon name="dots" size={16} />
        </button>
      </div>
      <ActivityDrawer open={activityOpen} onClose={() => setActivityOpen(false)} />
      <div className={styles.body}>
        <aside
          className={[styles.sidebar, collapsed ? styles.collapsed : ""]
            .filter(Boolean)
            .join(" ")}
        >
          <div className={styles.nav}>
            {nav.map((item) => (
              <button
                key={item.id}
                type="button"
                className={[styles.navitem, activeNav === item.id ? styles.active : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onNavigate(item.id)}
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.settings}
            onClick={onSignOut}
            disabled={!onSignOut}
          >
            <Icon name="settings" size={16} />
            Sign out
          </button>
        </aside>
        <div className={styles.main}>
          <div className={styles.page}>{children}</div>
        </div>
      </div>
    </div>
  );
}
