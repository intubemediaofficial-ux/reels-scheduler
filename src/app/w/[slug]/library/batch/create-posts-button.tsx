"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { createPostsFromAssetsAction } from "@/server/actions/post.actions";

export function CreatePostsButton({ slug, assetIds }: { slug: string; assetIds: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        disabled={pending || !assetIds.length}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await createPostsFromAssetsAction(slug, assetIds);
            if (!r.ok) setError(r.error);
            else router.push(r.data.postIds.length === 1 ? `/w/${slug}/posts/${r.data.postIds[0]}` : `/w/${slug}/posts`);
          });
        }}
      >
        {pending ? "Creating…" : `Next: create ${assetIds.length} post(s) →`}
      </Button>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
