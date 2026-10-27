import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

    const body = (await req.json()) as { text?: string };
    const text = typeof body.text === 'string' ? body.text : '';
    const userId = session.user.id;
    if (!text.trim()) return new NextResponse("Invalid comment", { status: 400 });

    let issueId = id;
    const report = await prisma.report.findUnique({
      where: { id },
      select: { issueId: true }
    });
    if (report) {
      issueId = report.issueId;
    }

    const comment = await prisma.comment.create({
      data: {
        text,
        userId,
        issueId,
      }
    });

    return NextResponse.json(comment);
  } catch (error) {
    console.error("Comment error:", error);
    return new NextResponse("Error commenting", { status: 500 });
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    let issueId = id;
    const report = await prisma.report.findUnique({
      where: { id },
      select: { issueId: true }
    });
    if (report) {
      issueId = report.issueId;
    }

    const comments = await prisma.comment.findMany({
      where: { issueId },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(comments);
  } catch (e) {
    console.error("Fetch comments error:", e);
    return new NextResponse("Error fetching comments", { status: 500 });
  }
}
