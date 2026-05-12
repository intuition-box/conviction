"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, TrendingUp, LayoutDashboard, ChevronsLeft, ChevronsRight, Wallet, LogOut, UserPen } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useAccount } from "wagmi";

import { Avatar } from "@/components/Avatar/Avatar";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useOnboarding } from "@/features/onboarding/OnboardingContext";
import { SOCIAL_ICONS } from "@/components/SocialIcons/SocialIcons";
import { labels } from "@/lib/vocabulary";
import { useSidebar } from "./SidebarContext";
import styles from "./Sidebar.module.css";

const NAV_ITEMS = [
  { href: "/", label: "Feed", icon: Home, requiresAuth: false, disabled: false },
  { href: "/themes", label: "Explore", icon: Compass, requiresAuth: false, disabled: false },
  { href: "/trending", label: "Trending", icon: TrendingUp, requiresAuth: false, disabled: true },
  { href: "/me", label: labels.dashboardNavLabel, icon: LayoutDashboard, requiresAuth: true, disabled: false },
] as const;

function UserMenu({
  walletDisplayName,
  onDisconnect,
}: {
  walletDisplayName: string;
  onDisconnect: () => void;
}) {
  const { profile, connectedProviders } = useUserProfile();
  const { openEditDialog } = useOnboarding();

  const displayName = profile?.displayName || walletDisplayName;
  const avatarSrc = profile?.avatar || null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={styles.userMenuTrigger}>
          <Avatar src={avatarSrc} name={displayName} size="sm" />
          <span className={styles.connectBtnLabel}>{displayName}</span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles.dropdownContent}
          side="right"
          align="end"
          sideOffset={8}
        >
          {connectedProviders.length > 0 && (
            <>
              <div className={styles.socialBadges}>
                {connectedProviders.map((p) => {
                  const Icon = SOCIAL_ICONS[p.provider];
                  return <Icon key={p.provider} />;
                })}
              </div>
              <DropdownMenu.Separator className={styles.dropdownSeparator} />
            </>
          )}

          <DropdownMenu.Item
            className={styles.dropdownItem}
            onSelect={openEditDialog}
          >
            <UserPen size={14} />
            <span>Edit profile</span>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={styles.dropdownItem}
            onSelect={onDisconnect}
          >
            <LogOut size={14} />
            <span>Disconnect</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const { isConnected } = useAccount();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const visibleNavItems = NAV_ITEMS.filter((item) => !item.requiresAuth || isConnected);

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}>
      <Link href="/" className={styles.logo} aria-label="PULSE">
        <span className={styles.logoText}>{collapsed ? "P" : "PULSE"}</span>
      </Link>

      <nav className={styles.nav}>
        {visibleNavItems.map(({ href, label, icon: Icon, disabled }) =>
          disabled ? (
            <span
              key={href}
              className={`${styles.navLink} ${styles.navLinkDisabled}`}
              aria-disabled="true"
              title={`${label} — coming soon`}
            >
              <Icon className={styles.navIcon} />
              {!collapsed && <span>{label}</span>}
            </span>
          ) : (
            <Link
              key={href}
              href={href}
              className={`${styles.navLink} ${isActive(href) ? styles.navLinkActive : ""}`}
              title={collapsed ? label : undefined}
            >
              <Icon className={styles.navIcon} />
              {!collapsed && <span>{label}</span>}
            </Link>
          ),
        )}
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
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
              const connected = mounted && account && chain;

              if (!connected) {
                return (
                  <button
                    type="button"
                    onClick={openConnectModal}
                    className={styles.connectBtn}
                  >
                    <Wallet size={14} />
                    <span>Connect wallet</span>
                  </button>
                );
              }

              return (
                <UserMenu
                  walletDisplayName={account.displayName}
                  onDisconnect={openAccountModal}
                />
              );
            }}
          </ConnectButton.Custom>
        </div>
      )}
    </aside>
  );
}
