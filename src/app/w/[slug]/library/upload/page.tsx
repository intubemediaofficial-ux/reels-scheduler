import { requireWorkspace } from "@/lib/tenant";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/ui";
import { Uploader } from "./uploader";

export default async function UploadPage({ params }: PageProps<"/w/[slug]/library/upload">) {
  const { slug } = await params;
  await requireWorkspace(slug, "media.upload");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Upload Reels" description="Bulk upload videos. Each file is checked for duplicates and validated against Meta's Reels requirements." />
      <Uploader slug={slug} maxMb={env().REEL_MAX_FILE_MB} />
    </div>
  );
}
