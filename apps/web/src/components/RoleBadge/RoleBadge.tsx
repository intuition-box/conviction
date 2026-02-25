import { labels } from "@/lib/vocabulary";
import styles from "./RoleBadge.module.css";

type RoleBadgeProps = {
  role: "MAIN" | "SUPPORTING";
  starred?: boolean;
};

export function RoleBadge({ role, starred }: RoleBadgeProps) {
  const text = role === "MAIN" ? labels.roleMain : labels.roleSupporting;
  return (
    <span className={styles.badge} data-role={role}>
      {starred && "★ "}{text}
    </span>
  );
}
