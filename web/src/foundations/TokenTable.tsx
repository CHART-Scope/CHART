"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

export type SwatchSpec = {
  token: string;
  label: string;
  note?: string;
};

export function useTokenValue(token: string) {
  const [value, setValue] = useState<string>("");
  useEffect(() => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(token)
      .trim();
    setValue(raw);
  }, [token]);
  return value;
}

export function SwatchGrid({ swatches }: { swatches: SwatchSpec[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: 14,
      }}
    >
      {swatches.map((s) => (
        <Swatch key={s.token} spec={s} />
      ))}
    </div>
  );
}

function Swatch({ spec }: { spec: SwatchSpec }) {
  const hex = useTokenValue(spec.token);
  return (
    <div
      style={{
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div style={{ height: 64, background: `var(${spec.token})` }} />
      <div style={{ background: "var(--color-white)", padding: "8px 10px" }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 11,
            fontWeight: 500,
            color: "var(--color-charcoal)",
          }}
        >
          {spec.label}
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 10,
            color: "var(--color-text-light)",
          }}
        >
          {hex || spec.token}
          {spec.note ? ` · ${spec.note}` : ""}
        </div>
      </div>
    </div>
  );
}

export function TokenRow({ token, children }: { token: string; children?: ReactNode }) {
  const value = useTokenValue(token);
  return (
    <tr>
      <td style={cellCode}>
        <code>{token}</code>
      </td>
      <td style={cellValue}>{value}</td>
      <td style={cellNote}>{children}</td>
    </tr>
  );
}

export function TokenTable({ children }: { children: ReactNode }) {
  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontFamily: "var(--font-body)",
        fontSize: 13,
      }}
    >
      <thead>
        <tr>
          <th style={headerCell}>Token</th>
          <th style={headerCell}>Value</th>
          <th style={headerCell}>Notes</th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

const headerCell: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid var(--border-subtle)",
  fontFamily: "var(--font-display)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--color-text-light)",
};
const cellCode: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--color-grey-light)",
  fontFamily: "var(--font-display)",
  fontSize: 12,
  color: "var(--color-charcoal)",
};
const cellValue: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--color-grey-light)",
  fontFamily: "var(--font-display)",
  fontSize: 12,
  color: "var(--color-text-muted)",
};
const cellNote: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--color-grey-light)",
  color: "var(--color-text-muted)",
};
