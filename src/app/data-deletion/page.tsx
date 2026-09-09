import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Data Deletion Instructions" };

export default function DataDeletionPage() {
  return (
    <LegalPage title="Data Deletion Instructions" updated="September 2026">
      <p>Meta requires every app to publish how users can delete their data. You can do so in three ways.</p>
      <h2>1. Disconnect a Facebook / Instagram account</h2>
      <p>
        In your workspace, open <strong>Connected Accounts</strong> and click <strong>Disconnect</strong>. This revokes the token with
        Meta and deletes the stored (encrypted) token, page and Instagram account records for that connection. Scheduled posts
        targeting that account are cancelled.
      </p>
      <h2>2. Remove the app from Facebook</h2>
      <p>
        Go to Facebook <strong>Settings &amp; privacy → Settings → Business integrations</strong>, find Reels Scheduler and click{" "}
        <strong>Remove</strong>. Meta sends us a deauthorization callback and we delete the associated tokens and account records.
      </p>
      <h2>3. Delete your workspace or account</h2>
      <p>
        Workspace Owners can delete the workspace from <strong>Workspace Settings</strong>. This removes all media, posts, captions,
        schedules, tokens and audit logs for that workspace. To delete your user account entirely, email
        [privacy@yourdomain] from the registered address; we complete deletion within 30 days and confirm by email.
      </p>
      <h2>Questions</h2>
      <p>Contact [privacy@yourdomain].</p>
    </LegalPage>
  );
}
