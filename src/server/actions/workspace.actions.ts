"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { requireWorkspace } from "@/lib/tenant";
import { validation, runAction, type ActionResult } from "@/lib/errors";
import {
  acceptInvitation,
  changeMemberRole,
  createWorkspace,
  inviteMember,
  removeMember,
  revokeInvitation,
  updateWorkspaceSettings,
} from "@/server/services/workspace.service";

const roleSchema = z.enum(["OWNER", "ADMIN", "EDITOR", "VIEWER"]);
const uuid = z.string().uuid();

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

export async function createWorkspaceAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const schema = z.object({ name: z.string().trim().min(2, "Name must be at least 2 characters.").max(60), timezone: z.string().min(1) });
  let slug: string | null = null;
  const result = await runAction(async () => {
    const userId = await requireUserId();
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw validation(firstIssue(parsed.error));
    const ws = await createWorkspace(userId, parsed.data);
    slug = ws.slug;
    return undefined;
  });
  if (result.ok && slug) redirect(`/w/${slug}`);
  return result;
}

export async function updateWorkspaceSettingsAction(slug: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const schema = z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters.").max(60),
    timezone: z.string().min(1),
    defaultCaptionLanguage: z.enum(["EN", "HI", "HINGLISH"]),
    approvalRequired: z.coerce.boolean(),
    autoApproveAiCaptions: z.coerce.boolean(),
    safePublishIntervalSec: z.coerce.number().int().min(0).max(86400),
    mediaRetentionDays: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .pipe(z.number().int().min(1).nullable()),
  });
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "workspace.settings.manage");
    const raw = Object.fromEntries(formData);
    const parsed = schema.safeParse({
      ...raw,
      approvalRequired: raw.approvalRequired === "on",
      autoApproveAiCaptions: raw.autoApproveAiCaptions === "on",
    });
    if (!parsed.success) throw validation(firstIssue(parsed.error));
    await updateWorkspaceSettings(ctx, parsed.data);
    revalidatePath(`/w/${slug}`, "layout");
    return undefined;
  });
}

export async function inviteMemberAction(slug: string, _prev: ActionResult<{ url: string }> | null, formData: FormData): Promise<ActionResult<{ url: string }>> {
  const schema = z.object({ email: z.string().trim().email("Enter a valid email."), role: roleSchema });
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "members.manage");
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw validation(firstIssue(parsed.error));
    const { url } = await inviteMember(ctx, parsed.data);
    revalidatePath(`/w/${slug}/team`);
    return { url };
  });
}

export async function revokeInvitationAction(slug: string, formData: FormData): Promise<void> {
  const ctx = await requireWorkspace(slug, "members.manage");
  const id = uuid.parse(formData.get("invitationId"));
  await revokeInvitation(ctx, id);
  revalidatePath(`/w/${slug}/team`);
}

export async function changeMemberRoleAction(slug: string, formData: FormData): Promise<void> {
  const ctx = await requireWorkspace(slug, "members.manage");
  const memberId = uuid.parse(formData.get("memberId"));
  const role = roleSchema.parse(formData.get("role"));
  await changeMemberRole(ctx, memberId, role);
  revalidatePath(`/w/${slug}/team`);
}

export async function removeMemberAction(slug: string, formData: FormData): Promise<void> {
  const ctx = await requireWorkspace(slug, "members.read");
  const memberId = uuid.parse(formData.get("memberId"));
  await removeMember(ctx, memberId);
  revalidatePath(`/w/${slug}/team`);
}

export async function acceptInvitationAction(token: string): Promise<ActionResult> {
  let slug: string | null = null;
  const result = await runAction(async () => {
    const userId = await requireUserId();
    const ws = await acceptInvitation(userId, token);
    slug = ws.slug;
    return undefined;
  });
  if (result.ok && slug) redirect(`/w/${slug}`);
  return result;
}
