"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, TrendingUp, ChevronsLeft, ChevronsRight } from "lucide-react";

import { useSidebar } from "./SidebarContext";
import styles from "./Sidebar.module.css";

const NAV_ITEMS = [
  { href: "/", label: "Feed", icon: Home },
  { href: "/themes", label: "Explore", icon: Compass },
  { href: "/trending", label: "Trending", icon: TrendingUp },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}>
      <Link href="/" className={styles.logo}>
        <span className={styles.logoMark}>DM</span>
        {!collapsed && <span className={styles.logoText}>Debate Market</span>}
      </Link>

      <nav className={styles.nav}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`${styles.navLink} ${isActive(href) ? styles.navLinkActive : ""}`}
            title={collapsed ? label : undefined}
          >
            <Icon className={styles.navIcon} />
            {!collapsed && <span>{label}</span>}
          </Link>
        ))}
      </nav>

      <div className={styles.spacer} />

      <button
        className={styles.toggleBtn}
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
      </button>

      {!collapsed && (
        <div className={styles.footer}>
          <span className={styles.networkBadge}>
            <span className={styles.networkDot} />
            Intuition testnet
          </span>
        </div>
      )}
    </aside>
  );
}
