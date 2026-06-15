import type { ReactNode } from "react";

import "./Navbar.css";

export type NavbarLink = {
  href: string;
  label: string;
};

type NavbarProps = {
  action?: ReactNode;
  ariaLabel: string;
  brandHref?: string;
  brandLabel?: string;
  links: NavbarLink[];
  onBrandClick?: () => void;
};

export function Navbar({
  action,
  ariaLabel,
  brandHref = "/",
  brandLabel = "CHART",
  links,
  onBrandClick,
}: NavbarProps) {
  const brand = onBrandClick ? (
    <button className="ui-navbar-brand" type="button" onClick={onBrandClick}>
      {brandLabel}
    </button>
  ) : (
    <a className="ui-navbar-brand" href={brandHref}>
      {brandLabel}
    </a>
  );

  return (
    <header className="ui-navbar">
      {brand}

      <nav className="ui-navbar-links" aria-label={ariaLabel}>
        {links.map((item) => (
          <a className="ui-navbar-link" href={item.href} key={item.href}>
            {item.label}
          </a>
        ))}
      </nav>

      {action ? <div className="ui-navbar-actions">{action}</div> : null}
    </header>
  );
}
