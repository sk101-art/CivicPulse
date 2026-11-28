"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { subscribeIssueUpdates } from "@/lib/map/statusPresentation";

export function RecordRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const recordPage = pathname === "/citizen/dashboard" ||
      pathname === "/citizen/audit" || pathname === "/desk/dashboard" ||
      pathname.startsWith("/citizen/report/") || pathname.startsWith("/issue/");
    if (!recordPage) return;
    return subscribeIssueUpdates(() => router.refresh());
  }, [pathname, router]);
  return null;
}
