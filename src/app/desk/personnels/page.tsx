import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listEnrichedPersonnels } from "@/lib/desk/personnelData";
import { PersonnelManager } from "@/components/authority/PersonnelManager";
import { redirect } from "next/navigation";

export const revalidate = 0;

export default async function DeskPersonnelPage() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "AUTHORITY") {
    redirect("/login/staff");
  }

  let personnels: Awaited<ReturnType<typeof listEnrichedPersonnels>> = [];
  try {
    personnels = await listEnrichedPersonnels();

    if (personnels.length === 0) {
      const totalCount = await prisma.personnel.count();
      if (totalCount === 0) {
        const initialRoster = [
          { name: "Ravi Kumar", role: "Senior Field Engineer", contact: "+91 98765 43021", active: true },
          { name: "Meera Nair", role: "Road Works Supervisor", contact: "+91 98456 76120", active: true },
          { name: "Arjun Patel", role: "Drainage Technician", contact: "+91 99879 22109", active: true },
          { name: "S. Ramesh", role: "Electrical Maintenance Lead", contact: "+91 98123 77090", active: true },
        ];

        for (const p of initialRoster) {
          await prisma.personnel.create({ data: p });
        }

        personnels = await listEnrichedPersonnels();
      }
    }
  } catch (err) {
    console.warn("Could not query personnels table:", err);
  }

  return (
    <main className="flex-1 overflow-y-auto w-full h-full pb-24 lg:pb-8 bg-[#F3F2EB]">
      <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
        <PersonnelManager initialPersonnels={personnels} />
      </div>
    </main>
  );
}
