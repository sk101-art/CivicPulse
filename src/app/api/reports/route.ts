import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Category } from "@prisma/client";
import { chatWithModel } from "@/lib/ollama";

const CATEGORY_TO_DEPT_CODE: Record<Category, string> = {
  POTHOLES: 'PWD',
  DRAINAGE: 'PWD',
  SIDEWALKS: 'PWD',
  STREETLIGHTS: 'TRANS',
  TRAFFIC_SIGNS: 'TRANS',
  GRAFFITI: 'PWD',
  TRASH: 'PWD',
  OTHER: 'PWD'
};

const DEFAULT_REPORT_POINTS = 25;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'CITIZEN') {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { title, description, category, latitude, longitude, address } = await req.json();
    const userId = (session.user as any).id;

    const profile = await prisma.citizenProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      return new NextResponse("Profile not found", { status: 404 });
    }

    // Find the correct department
    const deptCode = CATEGORY_TO_DEPT_CODE[category as Category] || 'PWD';
    let dept = await prisma.department.findUnique({ where: { code: deptCode } });
    if (!dept) {
      dept = await prisma.department.findFirst();
    }
    if (!dept) {
      return new NextResponse("No departments configured", { status: 500 });
    }

    // AI Prioritization (with fallback)
    let priorityScore = 0.5;
    try {
      const aiResponse = await chatWithModel(
        `Score this civic issue priority from 0.0 to 1.0 (Higher=Critical). Return ONLY a JSON like {"score": 0.85}. Issue: ${title} - ${description}`
      );
      const jsonMatch = aiResponse.match(/\{.*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        priorityScore = parsed.score || 0.5;
      }
    } catch (e) {
      console.warn("AI Scoring unavailable, using default:", e);
    }

    // Use a transaction to create report AND award points atomically
    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Create the report
      const report = await tx.report.create({
        data: {
          title,
          description,
          category: category as Category,
          latitude: parseFloat(latitude) || 12.9716,
          longitude: parseFloat(longitude) || 77.5946,
          address: address || 'Auto-detected location',
          citizenId: profile.id,
          departmentId: dept!.id,
          status: 'OPEN',
          priorityScore
        }
      });

      // 2. Award default points for filing a report
      await tx.citizenProfile.update({
        where: { id: profile.id },
        data: { reputation: { increment: DEFAULT_REPORT_POINTS } }
      });

      // 3. Log the points
      await tx.pointLog.create({
        data: {
          points: DEFAULT_REPORT_POINTS,
          reason: `Filed civic report: ${title}`,
          citizenId: profile.id,
          reportId: report.id
        }
      });

      return report;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Report submission failed:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const citizenOnly = searchParams.get('citizenOnly');
    const search = searchParams.get('search');

    if (citizenOnly === 'true') {
      const userId = (session.user as any).id;
      const profile = await prisma.citizenProfile.findUnique({ where: { userId } });
      if (!profile) return NextResponse.json([]);

      const reports = await prisma.report.findMany({
        where: { citizenId: profile.id },
        orderBy: { createdAt: 'desc' }
      });
      return NextResponse.json(reports);
    }

    const deptId = searchParams.get('departmentId');
    let where: any = deptId ? { departmentId: deptId } : {};

    // Server-side search filtering
    if (search) {
      where = {
        ...where,
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { address: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ]
      };
    }

    const reports = await prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { votes: true, comments: true } }
      },
      take: 50
    });

    return NextResponse.json(reports, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      }
    });
  } catch (error) {
    return new NextResponse("Error fetching reports", { status: 500 });
  }
}
