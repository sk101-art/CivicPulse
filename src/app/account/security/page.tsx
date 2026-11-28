import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PasswordChangeForm } from "@/components/settings/PasswordChangeForm";
export default async function AccountSecurityPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <main className="mx-auto w-full max-w-xl space-y-5 p-6 text-[#293732]">
    <Link className="underline" href={session.user.role === "AUTHORITY" ? "/desk" : "/citizen/settings"}>Back to your workspace</Link>
    <h1 className="text-3xl font-semibold">Account security</h1>
    <PasswordChangeForm />
    <p>Forgotten passwords currently require the project administrator to verify your identity and perform recovery. Automated email recovery is not configured.</p>
  </main>;
}
