"use client";

import Link from "next/link";

import { SearchBar } from "@/components/SearchBar/SearchBar";
import { BurgerMenu } from "@/components/BurgerMenu/BurgerMenu";

import styles from "./HeroBar.module.css";

export function HeroBar() {
  return (
    <section className={styles.hero}>
      <div className={styles.heroBurger}>
        <BurgerMenu />
      </div>
      <h1 className={styles.heroTitle}>Debate Market</h1>
      <p className={styles.heroTagline}>
        What idea would you like to debate today ?
      </p>
      <div className={styles.heroSearch}>
        <SearchBar />
      </div>
      <div className={styles.heroCtas}>
        <Link href="/themes" className={`${styles.ctaLink} ${styles.ctaPrimary}`}>
          Explore
        </Link>
        <Link href="/about" className={`${styles.ctaLink} ${styles.ctaSecondary}`}>
          Learn more
        </Link>
      </div>
    </section>
  );
}
