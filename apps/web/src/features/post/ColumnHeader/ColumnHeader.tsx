"use client";

import styles from "./ColumnHeader.module.css";

type ColumnHeaderProps = {
  title: string;
  count: number;
  stance: "supports" | "refutes";
  onAddClick: () => void;
};

export function ColumnHeader({ title, count, stance, onAddClick }: ColumnHeaderProps) {
  return (
    <div className={styles.header} data-stance={stance}>
      <div className={styles.titleRow}>
        <h4 className={styles.title}>{title}</h4>
        <span className={styles.count}>{count}</span>
      </div>
      <button
        className={styles.addButton}
        onClick={onAddClick}
        aria-label={`Add reply to ${title}`}
        type="button"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M8 3.5V12.5M3.5 8H12.5"
            stroke="red"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
