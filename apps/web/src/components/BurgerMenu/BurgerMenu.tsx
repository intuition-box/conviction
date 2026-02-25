"use client";

import { useState, useRef, useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

import styles from "./BurgerMenu.module.css";

export function BurgerMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

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

  function handleConnect() {
    connect({ connector: injected() });
    setOpen(false);
  }

  function handleDisconnect() {
    disconnect();
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setOpen(false);
  }

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
      </button>

      {open && (
        <div className={styles.dropdown}>
          {isConnected && address ? (
            <>
              <p className={styles.address}>
                {address.slice(0, 6)}...{address.slice(-4)}
              </p>
              <button className={styles.menuItem} onClick={handleDisconnect}>
                Se déconnecter
              </button>
            </>
          ) : (
            <button className={styles.menuItem} onClick={handleConnect}>
              Se connecter
            </button>
          )}
          <button className={styles.menuItem} disabled>
            Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
