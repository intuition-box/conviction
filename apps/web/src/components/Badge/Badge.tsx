import type { HTMLAttributes } from "react";

import styles from "./Badge.module.css";

export type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "supports"
  | "refutes"
  | "protocol"
  | "theme";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: BadgeProps) {
  const classes = [styles.badge, styles[tone], className].filter(Boolean).join(" ");

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  );
}
