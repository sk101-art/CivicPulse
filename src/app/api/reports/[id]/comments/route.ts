import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type SessionUser = { id?: string; role?: string };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: reportId } = await params;
    const session = await getServerSession(authOptions);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const body = (await req.json()) as { text?: string };
    const text = typeof body.text === 'string' ? body.text : '';
    const sessionUser = session.user as SessionUser;
    const userId = sessionUser?.id;
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });
    if (!text.trim()) return new NextResponse("Invalid comment", { status: 400 });

    const comment = await prisma.comment.create({
      data: {
        text,
        userId,
        reportId
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
    const { id: reportId } = await params;

    const comments = await prisma.comment.findMany({
      where: { reportId },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(comments);
  } catch (e) {
    console.error("Fetch comments error:", e);
    return new NextResponse("Error fetching comments", { status: 500 });
  }
}
