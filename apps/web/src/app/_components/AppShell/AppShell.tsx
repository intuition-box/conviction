"use client";

import { Sidebar } from "../Sidebar/Sidebar";
import { BottomNav } from "../BottomNav/BottomNav";

import styles from "./AppShell.module.css";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className={styles.sidebar}>
        <Sidebar />
      </div>
      <div className={styles.content}>
        <div className={styles.mainColumn}>
          <main className={styles.main}>{children}</main>
        </div>
        <div className={styles.bottomNav}>
          <BottomNav />
        </div>
      </div>
    </>
  );
}
