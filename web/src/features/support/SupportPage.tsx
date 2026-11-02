import { BrandMark } from "@/components/BrandMark";
import { buttonClassName } from "@/components/Button";

import styles from "./SupportPage.module.css";

const CONTACT = "info@scopeimpact.fi";

const WAYS = [
  {
    title: "Share health data",
    text: "Births with their weight, or deaths of children under five, by month and place: from a health information system, a registry or a survey. We fit and check the heat model with your team, and the data stays under your terms.",
  },
  {
    title: "Climate and modelling work",
    text: "Heatwave thresholds from your meteorological service, finer climate data, or epidemiologists to fit and review the models for a new place.",
  },
  {
    title: "Partner or fund",
    text: "Ministries, health programmes and funders who want CHART for their country or region. Every new place is built with partners there.",
  },
];

/** A clicked map point as "12.3° N, 45.6° E", or null for anything else. */
function nearLabel(near: string | undefined): string | null {
  const match = near?.match(/^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return `${Math.abs(lat).toFixed(1)}° ${lat < 0 ? "S" : "N"}, ${Math.abs(lng).toFixed(1)}° ${lng < 0 ? "W" : "E"}`;
}

export async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ near?: string }>;
}) {
  const near = nearLabel((await searchParams).near);
  const mail = `mailto:${CONTACT}?subject=${encodeURIComponent(
    "Bring CHART to my area",
  )}&body=${encodeURIComponent(
    `${near ? `Area: near ${near}\n` : ""}How we could help (data, climate or modelling work, partnership or funding):\n`,
  )}`;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="CHART home">
          <BrandMark size={28} tone="light" wordmark />
        </a>
        <a className={styles.back} href="/explore">
          Back to the map
        </a>
      </header>
      <main className={styles.main}>
        <p className={styles.eyebrow}>Not covered yet</p>
        <h1>Bring CHART to your area</h1>
        <p className={styles.lede}>
          CHART shows how heat affects low birth weight and the deaths of young children
          for <strong>Kenya</strong> (every county and constituency) and{" "}
          <strong>Madhya Pradesh, India</strong> (every division and district). Each
          place needs its own health data and a model fitted to it, so new places are
          added with people there.
          {near && <> You were looking near {near}.</>}
        </p>
        <ol className={styles.ways}>
          {WAYS.map((way) => (
            <li key={way.title}>
              <h2>{way.title}</h2>
              <p>{way.text}</p>
            </li>
          ))}
        </ol>
        <div className={styles.actions}>
          <a className={buttonClassName({ size: "lg" })} href={mail}>
            Get in touch
          </a>
          <span className={styles.contact}>
            or write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </span>
        </div>
        <p className={styles.note}>
          CHART is free and open source: a ministry or partner can also run it for their
          own country.
        </p>
      </main>
    </div>
  );
}
