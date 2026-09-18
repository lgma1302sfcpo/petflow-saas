"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3,Building2,CalendarDays,CircleDollarSign,LayoutDashboard,PackageSearch,ReceiptText,Settings,ShieldCheck,ShoppingCart,Store,Users,Warehouse } from "lucide-react";

const icons = { BarChart3,Building2,CalendarDays,CircleDollarSign,LayoutDashboard,PackageSearch,ReceiptText,Settings,ShieldCheck,ShoppingCart,Store,Users,Warehouse };
export type NavIconKey = keyof typeof icons;
type NavLink = [string, string, NavIconKey, string?];

export function SidebarNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Navegação principal">
      {links.map(([href, label, iconKey]) => {
        const Icon = icons[iconKey];
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
