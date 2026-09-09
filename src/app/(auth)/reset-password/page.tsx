import Link from "next/link";
import { Alert } from "@/components/ui";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  if (!token) {
    return (
      <div className="space-y-4">
        <Alert>This reset link is missing its token.</Alert>
        <Link href="/forgot-password" className="text-sm text-indigo-600 hover:text-indigo-500">
          Request a new link
        </Link>
      </div>
    );
  }
  return <ResetPasswordForm token={token} />;
}
