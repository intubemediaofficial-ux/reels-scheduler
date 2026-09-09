import { requireWorkspace } from "@/lib/tenant";
import { Card, PageHeader } from "@/components/ui";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Workspace Settings" };

export default async function SettingsPage({ params }: PageProps<"/w/[slug]/settings">) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug, "workspace.settings.manage");
  const w = ctx.workspace;
  return (
    <>
      <PageHeader title="Workspace Settings" />
      <div className="max-w-2xl">
        <Card>
          <SettingsForm
            slug={slug}
            initial={{
              name: w.name,
              timezone: w.timezone,
              defaultCaptionLanguage: w.defaultCaptionLanguage,
              approvalRequired: w.approvalRequired,
              autoApproveAiCaptions: w.autoApproveAiCaptions,
              safePublishIntervalSec: w.safePublishIntervalSec,
              mediaRetentionDays: w.mediaRetentionDays,
            }}
          />
        </Card>
      </div>
    </>
  );
}
