import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { WardIntelligenceDashboard } from "@/components/intelligence/WardIntelligenceDashboard";

export const revalidate = 0;

export default async function CitizenWardIntelligencePage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CITIZEN') {
    redirect('/login');
  }

  return <WardIntelligenceDashboard role="CITIZEN" />;
}
