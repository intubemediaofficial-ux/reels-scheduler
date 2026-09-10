"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/tenant";
import { markAllRead } from "@/server/services/notification.service";

export async function markAllReadAction(slug: string): Promise<void> {
  const ctx = await requireWorkspace(slug, "notifications.read");
  await markAllRead(ctx.workspace.id, ctx.userId);
  revalidatePath(`/w/${slug}/notifications`);
  revalidatePath(`/w/${slug}`, "layout");
}
