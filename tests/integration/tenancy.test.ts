import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { requireWorkspaceForUser } from "@/lib/tenant";
import { registerUser } from "@/server/services/auth.service";
import {
  acceptInvitation,
  changeMemberRole,
  createWorkspace,
  inviteMember,
  removeMember,
} from "@/server/services/workspace.service";
import { setEmailProviderForTests } from "@/lib/providers/email";

const run = Date.now().toString(36);
const email = (n: string) => `${n}-${run}@test.local`;

let alice: string;
let bob: string;
let carol: string;
let wsA: { id: string; slug: string };
let wsB: { id: string; slug: string };

beforeAll(async () => {
  setEmailProviderForTests({ send: async () => {} });
  alice = (await registerUser({ email: email("alice"), password: "correct-horse-battery", name: "Alice" })).id;
  bob = (await registerUser({ email: email("bob"), password: "correct-horse-battery", name: "Bob" })).id;
  carol = (await registerUser({ email: email("carol"), password: "correct-horse-battery", name: "Carol" })).id;
  wsA = await createWorkspace(alice, { name: "Label A", timezone: "Asia/Kolkata" });
  wsB = await createWorkspace(bob, { name: "Label B", timezone: "Asia/Kolkata" });
});

afterAll(async () => {
  await db.workspace.deleteMany({ where: { id: { in: [wsA.id, wsB.id] } } });
  await db.user.deleteMany({ where: { id: { in: [alice, bob, carol] } } });
  await db.$disconnect();
});

describe("workspace creation", () => {
  it("creates owner membership, brand kit and audit entry", async () => {
    const ctx = await requireWorkspaceForUser(alice, wsA.slug);
    expect(ctx.role).toBe("OWNER");
    expect(await db.brandKit.findUnique({ where: { workspaceId: wsA.id } })).not.toBeNull();
    expect(await db.auditLog.count({ where: { workspaceId: wsA.id, action: "workspace.created" } })).toBe(1);
  });

  it("gives colliding names distinct slugs", async () => {
    const dup = await createWorkspace(alice, { name: "Label A", timezone: "Asia/Kolkata" });
    expect(dup.slug).not.toBe(wsA.slug);
    await db.workspace.delete({ where: { id: dup.id } });
  });

  it("rejects unknown timezones", async () => {
    await expect(createWorkspace(alice, { name: "X Y", timezone: "Mars/Olympus" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("tenant isolation", () => {
  it("non-members get NOT_FOUND (not FORBIDDEN) for another tenant's workspace", async () => {
    await expect(requireWorkspaceForUser(bob, wsA.slug)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(requireWorkspaceForUser(alice, wsB.slug)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not leak soft-deleted workspaces", async () => {
    await db.workspace.update({ where: { id: wsB.id }, data: { deletedAt: new Date() } });
    await expect(requireWorkspaceForUser(bob, wsB.slug)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.workspace.update({ where: { id: wsB.id }, data: { deletedAt: null } });
  });
});

describe("invitations and roles", () => {
  it("invite → accept grants the invited role; wrong email is refused", async () => {
    const owner = await requireWorkspaceForUser(alice, wsA.slug, "members.manage");
    const { url } = await inviteMember(owner, { email: email("carol"), role: "EDITOR" });
    const token = url.split("/invite/")[1];

    await expect(acceptInvitation(bob, token)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await acceptInvitation(carol, token);

    const ctx = await requireWorkspaceForUser(carol, wsA.slug);
    expect(ctx.role).toBe("EDITOR");
    await expect(acceptInvitation(carol, token)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("editor is denied privileged permissions server-side", async () => {
    await expect(requireWorkspaceForUser(carol, wsA.slug, "posts.approve")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requireWorkspaceForUser(carol, wsA.slug, "members.manage")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const editor = await requireWorkspaceForUser(carol, wsA.slug);
    await expect(inviteMember(editor, { email: email("dave"), role: "VIEWER" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admins cannot promote to admin/owner; the last owner cannot be demoted or removed", async () => {
    const owner = await requireWorkspaceForUser(alice, wsA.slug, "members.manage");
    const carolMember = await db.workspaceMember.findFirstOrThrow({ where: { workspaceId: wsA.id, userId: carol } });
    await changeMemberRole(owner, carolMember.id, "ADMIN");

    const admin = await requireWorkspaceForUser(carol, wsA.slug, "members.manage");
    const ownerMember = await db.workspaceMember.findFirstOrThrow({ where: { workspaceId: wsA.id, userId: alice } });
    await expect(changeMemberRole(admin, carolMember.id, "OWNER")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(removeMember(admin, ownerMember.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(changeMemberRole(owner, ownerMember.id, "ADMIN")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(removeMember(owner, ownerMember.id)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("a member of workspace A cannot act on member rows of workspace B", async () => {
    const owner = await requireWorkspaceForUser(alice, wsA.slug, "members.manage");
    const bobMember = await db.workspaceMember.findFirstOrThrow({ where: { workspaceId: wsB.id, userId: bob } });
    await expect(changeMemberRole(owner, bobMember.id, "VIEWER")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(removeMember(owner, bobMember.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("every membership change is audited without secrets", async () => {
    const logs = await db.auditLog.findMany({ where: { workspaceId: wsA.id } });
    const actions = new Set(logs.map((l) => l.action));
    expect(actions).toContain("member.invited");
    expect(actions).toContain("member.invite_accepted");
    expect(actions).toContain("member.role_changed");
    expect(JSON.stringify(logs)).not.toMatch(/tokenHash|passwordHash/);
  });
});
