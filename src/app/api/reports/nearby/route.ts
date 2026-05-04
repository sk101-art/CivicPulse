import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function toNumber(value: string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any)?.role as string | undefined;
  if (role !== "CITIZEN" && role !== "AUTHORITY") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const lat = toNumber(url.searchParams.get("lat"));
  const lng = toNumber(url.searchParams.get("lng"));
  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });
  }

  const radiusRaw = toNumber(url.searchParams.get("radius"));
  const radius = clamp(radiusRaw ?? 500, 50, 2000);

  const status = url.searchParams.get("status");
  const category = url.searchParams.get("category");

  // Bounding box pre-filter (meters -> degrees)
  const latDelta = radius / 111_320;
  const lngDelta = radius / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));

  const where: any = {
    latitude: { gte: lat - latDelta, lte: lat + latDelta },
    longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
  };

  if (status && status !== "ALL") {
    where.status = status;
  }
  if (category && category !== "ALL") {
    where.category = category;
  }

  const candidates = await prisma.report.findMany({
    where,
    select: {
      id: true,
      latitude: true,
      longitude: true,
      title: true,
      status: true,
      category: true,
      priorityScore: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 250,
  });

  const reports = candidates.filter((r) => haversineMeters(lat, lng, r.latitude, r.longitude) <= radius);

  return NextResponse.json({
    radius,
    count: reports.length,
    reports,
  });
}
