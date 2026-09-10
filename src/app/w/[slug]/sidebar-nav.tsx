"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Icon, type IconName } from "@/components/icons";

export type NavItem = { href: string; label: string; icon: IconName; badge?: number; exact?: boolean };

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // Longest matching prefix wins, so /library/upload lights up "Upload" rather than "Library".
  const activeHref = items
    .filter((i) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Workspace" className="flex gap-1 overflow-x-auto px-3 py-2 md:flex-col md:overflow-visible">
      {items.map((item) => {
        const active = item.href === activeHref;
        const I = Icon[item.icon];
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition",
              active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
            )}
          >
            <I className={clsx("shrink-0", active ? "text-indigo-300" : "text-slate-400")} />
            <span className="flex-1">{item.label}</span>
            {item.badge ? <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{item.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
