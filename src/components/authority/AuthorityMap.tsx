"use client";

import React from "react";
import { BaseMap, BaseMapProps } from "@/components/map/BaseMap";
import { ReportPoint } from "@/components/map/types";

export type { ReportPoint };

export default function CivicMap(props: BaseMapProps) {
  return <BaseMap {...props} />;
}
