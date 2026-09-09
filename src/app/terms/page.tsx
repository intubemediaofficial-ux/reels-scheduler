import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="September 2026">
      <p>By using Reels Scheduler you agree to these terms. Replace the operator details with your legal entity before going live.</p>
      <h2>Your account and workspace</h2>
      <ul>
        <li>You are responsible for activity under your account and for the roles you grant to team members.</li>
        <li>Workspace Owners may add, remove and change roles of members and are responsible for their workspace.</li>
      </ul>
      <h2>Connected Meta accounts</h2>
      <ul>
        <li>You must have authority to manage every Facebook Page and Instagram account you connect.</li>
        <li>You must comply with the Meta Platform Terms, Instagram Community Guidelines and Facebook Community Standards.</li>
        <li>
          Publishing depends on Meta&apos;s APIs, permissions and rate limits. Meta may reject, delay or remove content; we cannot
          guarantee delivery or engagement.
        </li>
      </ul>
      <h2>Your content</h2>
      <ul>
        <li>You confirm you own or have licensed all rights (including music rights) in the videos and audio you upload.</li>
        <li>AI-generated captions are suggestions. You are responsible for reviewing content before it is published.</li>
      </ul>
      <h2>Prohibited use</h2>
      <p>
        No spam, engagement manipulation, fake accounts, scraping, or any use that violates Meta policies or applicable law. We may
        suspend workspaces that put our Meta app access at risk.
      </p>
      <h2>Availability and liability</h2>
      <p>
        The Service is provided &quot;as is&quot;. To the fullest extent permitted by law we are not liable for indirect damages, lost
        revenue, or content that fails to publish.
      </p>
      <h2>Contact</h2>
      <p>Operator: [Your company name]. Email: [legal@yourdomain].</p>
    </LegalPage>
  );
}
