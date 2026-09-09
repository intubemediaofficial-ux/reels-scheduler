"use client";

import { useRef } from "react";
import type { WorkspaceRole } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/rbac";
import { Select } from "@/components/ui";

/** Submits the enclosing form as soon as a new role is picked. */
export function RoleSelect({ name, defaultValue, roles }: { name: string; defaultValue: WorkspaceRole; roles: WorkspaceRole[] }) {
  const ref = useRef<HTMLSelectElement>(null);
  const options = roles.includes(defaultValue) ? roles : [defaultValue, ...roles];
  return (
    <Select
      ref={ref}
      name={name}
      defaultValue={defaultValue}
      aria-label="Role"
      className="w-auto"
      onChange={() => ref.current?.form?.requestSubmit()}
    >
      {options.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </Select>
  );
}
