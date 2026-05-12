"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

import { labels } from "@/lib/vocabulary";
import styles from "./BurgerMenu.module.css";

export function BurgerMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isConnected } = useAccount();

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className={styles.wrapper} ref={menuRef}>
      <button
        className={styles.burger}
        onClick={() => setOpen(!open)}
        aria-label="Menu"
      >
        <span className={styles.line} />
        <span className={styles.line} />
        <span className={styles.line} />
        <span className={styles.label}>Menu</span>
      </button>

      {open && (
        <div className={styles.dropdown}>
          <ConnectButton />
          {isConnected && (
            <Link
              href="/me"
              className={styles.menuItem}
              onClick={() => setOpen(false)}
            >
              {labels.dashboardNavLabel}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
