"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

export function WorkspaceSwitcher({ current, workspaces }: { current: string; workspaces: { slug: string; name: string }[] }) {
  const router = useRouter();
  return (
    <Select
      aria-label="Switch workspace"
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
