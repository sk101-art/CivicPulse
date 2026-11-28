import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AreaBriefingView } from "@/components/desk/AreaBriefingView";

export const revalidate = 0;

export default async function DeskBriefingPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'AUTHORITY') {
    redirect('/login');
  }

  return (
    <main className="flex-1 overflow-y-auto w-full h-full pb-24 lg:pb-8 bg-[#F3F2EB]">
      <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
        <AreaBriefingView />
      </div>
    </main>
  );
}
