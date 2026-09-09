import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, can, canAssignRole } from "@/lib/rbac";

describe("RBAC matrix", () => {
  it("owner has every permission", () => {
    for (const p of PERMISSIONS) expect(can("OWNER", p)).toBe(true);
  });

  it("admin manages accounts, team, approvals and publishing but cannot delete the workspace", () => {
    expect(can("ADMIN", "accounts.manage")).toBe(true);
    expect(can("ADMIN", "members.manage")).toBe(true);
    expect(can("ADMIN", "posts.approve")).toBe(true);
    expect(can("ADMIN", "posts.publish")).toBe(true);
    expect(can("ADMIN", "workspace.delete")).toBe(false);
  });

  it("editor can upload, edit, generate captions and submit — not approve, schedule, publish or manage", () => {
    expect(can("EDITOR", "media.upload")).toBe(true);
    expect(can("EDITOR", "posts.edit")).toBe(true);
    expect(can("EDITOR", "captions.generate")).toBe(true);
    expect(can("EDITOR", "posts.submit")).toBe(true);
    expect(can("EDITOR", "posts.approve")).toBe(false);
    expect(can("EDITOR", "posts.schedule")).toBe(false);
    expect(can("EDITOR", "posts.publish")).toBe(false);
    expect(can("EDITOR", "accounts.manage")).toBe(false);
    expect(can("EDITOR", "members.manage")).toBe(false);
  });

  it("viewer is read-only", () => {
    for (const p of ROLE_PERMISSIONS.VIEWER) expect(p.endsWith(".read")).toBe(true);
    expect(can("VIEWER", "posts.read")).toBe(true);
    expect(can("VIEWER", "media.upload")).toBe(false);
  });

  it("role assignment: owner assigns anything, admin only below itself, others nothing", () => {
    expect(canAssignRole("OWNER", "OWNER")).toBe(true);
    expect(canAssignRole("ADMIN", "OWNER")).toBe(false);
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(false);
    expect(canAssignRole("ADMIN", "EDITOR")).toBe(true);
    expect(canAssignRole("ADMIN", "VIEWER")).toBe(true);
    expect(canAssignRole("EDITOR", "VIEWER")).toBe(false);
    expect(canAssignRole("VIEWER", "VIEWER")).toBe(false);
  });
});
