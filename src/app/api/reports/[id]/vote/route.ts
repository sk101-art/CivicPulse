import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: reportId } = await params;
    const session = await getServerSession(authOptions);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const { value } = await req.json();
    const userId = (session.user as any).id;

    const profile = await prisma.citizenProfile.findUnique({ where: { userId } });
    if (!profile) return new NextResponse("Profile not found", { status: 404 });

    const vote = await prisma.vote.upsert({
      where: {
        reportId_citizenId: {
          reportId,
          citizenId: profile.id
        }
      },
      update: { value },
      create: {
        reportId,
        citizenId: profile.id,
        value
      }
    });

    return NextResponse.json(vote);
  } catch (error) {
    console.error("Vote error:", error);
    return new NextResponse("Error voting", { status: 500 });
  }
}
