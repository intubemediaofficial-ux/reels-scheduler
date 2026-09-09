import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignUpForm } from "./sign-up-form";

export const metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const session = await auth();
  if (session?.user) redirect("/onboarding");
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return <SignUpForm next={next} />;
}
