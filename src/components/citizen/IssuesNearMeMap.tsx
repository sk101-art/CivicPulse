"use client";

import React from "react";
import { BaseMap } from "@/components/map/BaseMap";
import { ReportPoint } from "@/components/map/types";
import { useReports } from "@/hooks/useReports";

export type NearbyReport = ReportPoint;

export interface IssuesNearMeMapProps {
  reports?: NearbyReport[];
  showReportButton?: boolean;
  onReportLocationAction?: (lat: number, lng: number) => void;
  onReportLocation?: (lat: number, lng: number) => void;
}

export function IssuesNearMeMap({
  reports: propReports,
  showReportButton,
  onReportLocationAction,
  onReportLocation: propOnReportLocation,
}: IssuesNearMeMapProps) {
  const { reports: hookReports } = useReports();
  const reports =
    propReports || (hookReports as unknown as NearbyReport[]) || [];

  const handleReport = onReportLocationAction || propOnReportLocation;

  return (
    <BaseMap
      reports={reports}
      showReportButton={showReportButton}
      onReportLocation={handleReport}
    />
  );
}

export default IssuesNearMeMap;
