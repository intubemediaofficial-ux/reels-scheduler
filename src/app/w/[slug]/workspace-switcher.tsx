"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

export function WorkspaceSwitcher({ current, workspaces }: { current: string; workspaces: { slug: string; name: string }[] }) {
  const router = useRouter();
  return (
    <Select
      aria-label="Switch workspace"
      className="border-white/10 bg-white/5 text-white focus:border-indigo-400 focus:ring-indigo-500/30 [&>option]:text-slate-900"
      value={current}
      onChange={(e) => {
        const v = e.target.value;
        router.push(v === "__new__" ? "/onboarding?switch=1" : `/w/${v}`);
      }}
    >
      {workspaces.map((w) => (
        <option key={w.slug} value={w.slug}>
          {w.name}
        </option>
      ))}
      <option value="__new__">+ New workspace…</option>
    </Select>
  );
}
