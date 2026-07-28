import type { CSSProperties } from "react";

import type { IconName } from "./icons";

type Props = {
  name: IconName;
  size?: number | string;
  color?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

export function Icon({ name, size = "1em", color, className, style, title }: Props) {
  return (
    <svg
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{
        width: size,
        height: size,
        display: "inline-block",
        flexShrink: 0,
        verticalAlign: "-0.15em",
        color,
        ...style,
      }}
    >
      <use href={`#ic-${name}`} />
    </svg>
  );
}
