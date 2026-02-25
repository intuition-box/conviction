"use client";

import { BurgerMenu } from "@/components/BurgerMenu/BurgerMenu";
import { SearchBar } from "@/components/SearchBar/SearchBar";

import styles from "./TopBar.module.css";

export function TopBar() {
  return (
    <header className={styles.topbar}>
      <h1 className={styles.title}>Debate Market</h1>
      <SearchBar />
      <div className={styles.actions}>
        <BurgerMenu />
      </div>
    </header>
  );
}
