import type { ReactNode } from "react";

import styles from "./ThemeBadge.module.css";

type ThemeBadgeProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
};

export function ThemeBadge({ size = "md", className, children }: ThemeBadgeProps) {
  const classes = [styles.badge, styles[size], className].filter(Boolean).join(" ");

  return <span className={classes}>{children}</span>;
}
