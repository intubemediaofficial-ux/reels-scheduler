import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="September 2026">
      <p>
        Reels Scheduler (&quot;the Service&quot;) helps workspaces schedule and publish Reels to Instagram Professional accounts and
        Facebook Pages through Meta&apos;s official APIs. This policy explains what we collect and why. Replace the operator details
        below with your legal entity before going live.
      </p>
      <h2>Data we collect</h2>
      <ul>
        <li>Account data: name, email address and a salted password hash.</li>
        <li>Workspace data: workspace name, timezone, team membership and roles, brand kit, settings.</li>
        <li>
          Meta data: when you connect Facebook, we receive an OAuth access token, your Facebook user ID and name, the Pages you
          manage (ID, name, category, picture) and linked Instagram Professional accounts (ID, username, profile picture, follower
          count). We never ask for or store your Facebook or Instagram password.
        </li>
        <li>Content: videos, thumbnails, song metadata, captions and schedules you upload or create.</li>
        <li>Operational data: audit log of actions in your workspace, publish attempt results and error codes returned by Meta.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To publish content you schedule to the accounts you selected, at the time you chose.</li>
        <li>To generate caption suggestions from the song metadata you provide (sent to the configured AI provider).</li>
        <li>To show connection health, publishing status and notifications.</li>
        <li>To keep an audit trail for your workspace.</li>
      </ul>
      <h2>Meta platform data</h2>
      <p>
        Access tokens are encrypted at rest with AES-256-GCM and are only decrypted server-side to call the Graph API on your behalf.
        Tokens are never sent to your browser or written to logs. We use Meta data solely to provide the Service and in accordance
        with the Meta Platform Terms and Developer Policies. Disconnecting an account deletes its tokens.
      </p>
      <h2>Sharing</h2>
      <p>
        We share data only with the infrastructure providers needed to run the Service (hosting, database, object storage, email,
        AI provider) and with Meta when publishing. We do not sell personal data.
      </p>
      <h2>Retention and deletion</h2>
      <p>
        Data is kept while your workspace exists. You can delete media, posts, connected accounts, or your whole workspace at any
        time. See <a href="/data-deletion">Data Deletion Instructions</a>.
      </p>
      <h2>Contact</h2>
      <p>Operator: [Your company name], [address]. Email: [privacy@yourdomain].</p>
    </LegalPage>
  );
}
