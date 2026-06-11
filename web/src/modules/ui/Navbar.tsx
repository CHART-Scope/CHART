import type { ReactNode } from "react";

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
    <button className="landing-brand" type="button" onClick={onBrandClick}>
      {brandLabel}
    </button>
  ) : (
    <a className="landing-brand" href={brandHref}>
      {brandLabel}
    </a>
  );

  return (
    <header className="landing-nav">
      {brand}

      <nav className="landing-links" aria-label={ariaLabel}>
        {links.map((item) => (
          <a className="landing-link" href={item.href} key={item.href}>
            {item.label}
          </a>
        ))}
      </nav>

      {action ? <div className="landing-actions">{action}</div> : null}
    </header>
  );
}
