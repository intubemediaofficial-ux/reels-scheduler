"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteAssetAction } from "@/server/actions/media.actions";
import { createPostsFromAssetsAction } from "@/server/actions/post.actions";

export function AssetActions({ slug, assetId, canDelete, canCreatePost }: { slug: string; assetId: string; canDelete: boolean; canCreatePost: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {canCreatePost ? (
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await createPostsFromAssetsAction(slug, [assetId]);
                if (r.ok) router.push(`/w/${slug}/posts/${r.data.postIds[0]}`);
                else setError(r.error);
              })
            }
          >
            Create post
          </Button>
        ) : null}
        {canDelete ? (
          <ConfirmButton
            variant="danger"
            confirmText="Delete this video?"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteAssetAction(slug, assetId);
                if (r.ok) router.push(`/w/${slug}/library`);
                else setError(r.error);
              })
            }
          >
            Delete
          </ConfirmButton>
        ) : null}
      </div>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
