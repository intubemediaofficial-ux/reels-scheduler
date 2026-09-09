"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

export function SidebarNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace" className="flex gap-1 overflow-x-auto p-2 md:flex-col">
      {items.map((item) => {
        const active = item.href.endsWith(`/w/${item.href.split("/")[2]}`) ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium",
              active ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-100",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
