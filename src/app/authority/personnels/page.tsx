import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/AppHeader";
import { User, Shield, HardHat, Truck, Trash2, Plus, Phone, Mail } from "lucide-react";
import { PersonnelManager } from "@/components/authority/PersonnelManager";

import { redirect } from "next/navigation";

export const revalidate = 0;

export default async function PersonnelPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || (session.user as any).role !== 'AUTHORITY') {
    redirect('/login');
  }

  const userId = (session?.user as any)?.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { departmentId: true }
  });

  if (!user?.departmentId) {
    return (
      <main className="flex-1 p-10 bg-primary text-white">
        <h1 className="text-2xl font-display mb-4">Access Restricted</h1>
        <p className="text-text-secondary font-body">Your account is not assigned to any department.</p>
      </main>
    );
  }

  const deptId = user.departmentId;

  const personnels = await prisma.personnel.findMany({
    where: { departmentId: deptId },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <main className="flex-1 overflow-y-auto w-full h-full pb-24 lg:pb-0 bg-primary">
      <AppHeader 
        title="Field Personnel"
        subtitle="Staff Management"
        accentColor="var(--accent-cyan)"
      />

      <div className="p-6 md:p-8 space-y-10 max-w-7xl mx-auto">
        <PersonnelManager initialPersonnels={JSON.parse(JSON.stringify(personnels))} />
      </div>
    </main>
  );
}
