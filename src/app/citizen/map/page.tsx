import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CitizenMapLoader } from "@/components/citizen/CitizenMapLoader";

export const revalidate = 0;

export default async function CitizenMapPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CITIZEN') {
    redirect('/login/citizen');
  }

  return (
    <div className="w-full h-full flex flex-col font-body bg-[#F3F2EB]">
      <CitizenMapLoader />
    </div>
  );
}
