import Link from "next/link";

import styles from "./page.module.css";

const FLOWS = [
  {
    href: "/onboarding",
    meta: "Prototype · Kenya",
    title: "First-time onboarding",
    desc: "Invitation email → login → four-step wizard for role, geography, sector and collaborators.",
  },
  {
    href: "/plan",
    meta: "Connected · India · Madhya Pradesh",
    title: "Planning workspace",
    desc: "Choose an area and planning period → retrieve three climate inputs → run one cumulative low-birth-weight result.",
  },
];

export default function HomePage() {
  return (
    <main className={styles.wrap}>
      <h1 className={styles.brand}>CHART</h1>
      <p className={styles.tagline}>
        Climate &amp; Health Adaptation and Resilience Tool — a shared workspace for
        cross-sector teams to plan for the health impacts of a changing climate. This
        workspace contains the onboarding design and the connected Madhya Pradesh
        planning flow.
      </p>

      <div className={styles.grid}>
        {FLOWS.map((f) => (
          <Link key={f.href} href={f.href} className={styles.card}>
            <div className={styles.cardMeta}>{f.meta}</div>
            <div className={styles.cardTitle}>{f.title}</div>
            <p className={styles.cardDesc}>{f.desc}</p>
          </Link>
        ))}
      </div>

      <div className={styles.note}>
        <strong>For the design team</strong>
        Design tokens live in <code>src/styles/tokens.css</code>. Swap the values there
        — colours, radii, typography, spacing — to reskin every component without
        changes to markup. Component variants are all named through CSS Modules so the
        design system can be dropped in atomically.
      </div>
    </main>
  );
}
