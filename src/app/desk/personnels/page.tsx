import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PersonnelManager } from "@/components/authority/PersonnelManager";
import { redirect } from "next/navigation";

export const revalidate = 0;

export default async function DeskPersonnelPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user.role !== 'AUTHORITY') {
    redirect('/login');
  }

  let personnels: any[] = [];
  try {
    personnels = await prisma.personnel.findMany({
      orderBy: { createdAt: 'desc' }
    });
  } catch (err) {
    console.warn("Could not query personnels table:", err);
  }

  return (
    <main className="flex-1 overflow-y-auto w-full h-full pb-24 lg:pb-8 bg-[#F3F2EB]">
      <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
        <PersonnelManager initialPersonnels={JSON.parse(JSON.stringify(personnels))} />
      </div>
    </main>
  );
}
