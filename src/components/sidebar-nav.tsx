"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

type NavLink = [string, string, LucideIcon, string?];

export function SidebarNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Navegação principal">
      {links.map(([href, label, Icon]) => {
        const base = href.split("#")[0];
        const isRoot = base === "/app" || base === "/platform";
        const isActive = href.includes("#")
          ? pathname === base
          : pathname === base || (!isRoot && pathname.startsWith(`${base}/`));
        return (
          <Link href={href} key={label} className={isActive ? "active" : undefined} aria-current={isActive ? "page" : undefined}>
            <Icon size={18} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
