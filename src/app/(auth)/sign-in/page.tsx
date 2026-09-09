import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const session = await auth();
  if (session?.user) redirect("/onboarding");
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return <SignInForm next={next} />;
}
