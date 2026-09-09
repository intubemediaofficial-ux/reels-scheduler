"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/tenant";
import { runAction, type ActionResult } from "@/lib/errors";
import { checkConnectionHealth, disconnectConnection } from "@/server/services/accounts.service";

const uuid = z.string().uuid();

export async function disconnectConnectionAction(slug: string, connectionId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "accounts.manage");
    await disconnectConnection(ctx, uuid.parse(connectionId));
    revalidatePath(`/w/${slug}/accounts`);
    return undefined;
  });
}

export async function checkConnectionAction(slug: string, connectionId: string): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "accounts.manage");
    const status = await checkConnectionHealth(ctx, uuid.parse(connectionId));
    revalidatePath(`/w/${slug}/accounts`);
    return { status };
  });
}
