import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Category } from "@prisma/client";
import { chatWithModel } from "@/lib/ollama";

const CATEGORY_TO_DEPT_CODE: Record<string, string> = {
  POTHOLES: 'PWD', DRAINAGE: 'PWD', SIDEWALKS: 'PWD',
  STREETLIGHTS: 'TRANS', TRAFFIC_SIGNS: 'TRANS',
  GRAFFITI: 'PWD', TRASH: 'PWD', OTHER: 'PWD'
};

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'AUTHORITY') {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { title, description, category, latitude, longitude, address } = await req.json();
    const userId = (session.user as any).id;

    // Authority files on behalf of the system — find or create a system citizen profile
    // Use the authority's own department
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { department: true } });
    if (!user || !user.departmentId) {
      return new NextResponse("No department assigned", { status: 400 });
    }

    // Find a system citizen profile for authority-filed reports
    let systemProfile = await prisma.citizenProfile.findFirst({
      where: { user: { email: 'system@civicpulse.gov' } }
    });

    if (!systemProfile) {
      // Create a system user + profile for authority-filed reports
      const systemUser = await prisma.user.upsert({
        where: { email: 'system@civicpulse.gov' },
        update: {},
        create: {
          email: 'system@civicpulse.gov',
          name: 'Authority Filed',
          passwordHash: 'N/A',
          role: 'CITIZEN'
        }
      });
      systemProfile = await prisma.citizenProfile.upsert({
        where: { userId: systemUser.id },
        update: {},
        create: { userId: systemUser.id, reputation: 0 }
      });
    }

    // AI Priority scoring
    let priorityScore = 0.5;
    try {
      const aiResponse = await chatWithModel(
        `Score this civic issue priority from 0.0 to 1.0 (Higher=Critical). Return ONLY JSON like {"score": 0.85}. Issue: ${title} - ${description}`
      );
      if (aiResponse) {
        const jsonMatch = aiResponse.match(/\{.*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          priorityScore = parsed.score || 0.5;
        }
      }
    } catch (e) {
      console.warn("AI Scoring unavailable:", e);
    }

    const deptCode = CATEGORY_TO_DEPT_CODE[category] || 'PWD';
    let dept = await prisma.department.findUnique({ where: { code: deptCode } });
    if (!dept) dept = await prisma.department.findFirst();
    if (!dept) return new NextResponse("No departments configured", { status: 500 });

    const report = await prisma.report.create({
      data: {
        title,
        description,
        category: category as Category,
        latitude: parseFloat(latitude) || latitude,
        longitude: parseFloat(longitude) || longitude,
        address: address || `Map Pin (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
        citizenId: systemProfile.id,
        departmentId: dept.id,
        status: 'CONFIRMED',
        priorityScore
      }
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error("Authority report failed:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
