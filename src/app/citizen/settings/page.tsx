import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  Home,
  ChevronRight,
  User,
  ExternalLink,
} from "lucide-react";
import { AppInstallationCard } from "@/components/settings/AppInstallationCard";
import { OfflineCapabilitiesCard } from "@/components/settings/OfflineCapabilitiesCard";

export const revalidate = 0;

export default async function CitizenSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "CITIZEN") {
    redirect("/login/citizen");
  }

  const userId = session.user.id;
  if (!userId) {
    redirect("/login/citizen");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      citizenProfile: {
        select: {
          tier: true,
        },
      },
    },
  });

  const displayName =
    user?.name || session.user.name || session.user.email?.split("@")[0] || "Citizen";
  const displayEmail = user?.email || session.user.email || "";
  const displayTier = user?.citizenProfile?.tier || "CITIZEN";

  return (
    <div className="flex-1 overflow-y-auto flex flex-col font-body bg-[#F3F2EB] text-[#293732] w-full pb-24 lg:pb-12">
      <div className="p-6 md:p-8 lg:p-10 space-y-6 max-w-[1040px] mx-auto w-full">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs text-[#65736B] font-medium">
          <Link
            href="/citizen/dashboard"
            className="flex items-center gap-1 hover:text-[#293732] transition-colors"
          >
            <Home className="w-3.5 h-3.5 text-[#527B7A]" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-3 h-3 text-[#929B92]" />
          <span className="text-[#293732] font-semibold">Settings</span>
        </div>

        {/* Editorial Header */}
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-[#527B7A] tracking-wider uppercase font-mono">
            MUNICIPAL ACCOUNT &amp; APP PREFERENCES
          </div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#293732] font-semibold tracking-tight">
            Settings
          </h1>
          <p className="text-xs sm:text-sm text-[#65736B] leading-relaxed max-w-xl">
            Manage app installation, offline evidence synchronization, and browser permissions for this device.
          </p>
        </div>

        <Link href="/account/security" className="inline-block underline">Change password and account security</Link>

        {/* ── SECTION 1: APP INSTALLATION ── */}
        <section aria-labelledby="app-installation-heading">
          <AppInstallationCard />
        </section>

        {/* ── SECTION 2: OFFLINE EVIDENCE & SYNC ── */}
        <section aria-labelledby="offline-capabilities-heading">
          <OfflineCapabilitiesCard />
        </section>

        {/* ── SECTION 3: MUNICIPAL IDENTITY & PROFILE LINK ── */}
        <section aria-labelledby="account-identity-heading">
          <div className="bg-white rounded-[24px] sm:rounded-[26px] p-6 sm:p-8 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#E5E9E3] border border-[#DDDCD3] flex items-center justify-center text-[#527B7A] shrink-0">
                <User className="w-6 h-6 stroke-[1.8]" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <h2 id="account-identity-heading" className="sr-only">
                  Municipal Identity
                </h2>
                <div className="text-xs font-semibold text-[#293732] truncate">
                  {displayName}
                </div>
                {displayEmail && (
                  <div className="text-[11px] text-[#65736B] font-mono truncate">
                    {displayEmail}
                  </div>
                )}
                <div className="text-[11px] text-[#527B7A] font-medium">
                  Citizen Tier • {displayTier}
                </div>
              </div>
            </div>

            <Link
              href="/citizen/profile"
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-[#FAF9F5] border border-[#DDDCD3] text-xs sm:text-sm font-semibold text-[#293732] shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer self-start sm:self-auto shrink-0"
            >
              <span>View Profile &amp; Stats</span>
              <ExternalLink className="w-3.5 h-3.5 text-[#527B7A]" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
