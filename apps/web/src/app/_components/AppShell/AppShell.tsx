"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { SidebarProvider, useSidebar } from "../Sidebar/SidebarContext";
import { Sidebar } from "../Sidebar/Sidebar";
import { TopBar } from "../TopBar/TopBar";
import { BottomNav } from "../BottomNav/BottomNav";
import { HeroBar } from "../HeroBar/HeroBar";

import styles from "./AppShell.module.css";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const heroRef = useRef<HTMLDivElement>(null);
  const [heroVisible, setHeroVisible] = useState(true);

  useEffect(() => {
    if (!isHome) return;
    const el = heroRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isHome]);

  const sidebarClasses = [
    styles.sidebar,
    collapsed ? styles.sidebarCollapsed : "",
  ].filter(Boolean).join(" ");

  const contentClasses = [
    styles.content,
    collapsed ? styles.contentCollapsed : "",
    isHome ? styles.contentHome : "",
  ].filter(Boolean).join(" ");

  const topbarClasses = [
    styles.topbar,
    isHome && heroVisible ? styles.topbarHidden : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <div className={sidebarClasses}>
        <Sidebar />
      </div>
      <div className={contentClasses}>
        {isHome && (
          <div ref={heroRef}>
            <HeroBar />
          </div>
        )}
        <div className={styles.mainColumn}>
          <div className={topbarClasses}>
            <TopBar />
          </div>
          <main className={styles.main}>{children}</main>
        </div>
        <div className={styles.bottomNav}>
          <BottomNav />
        </div>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ShellInner>{children}</ShellInner>
    </SidebarProvider>
  );
}
