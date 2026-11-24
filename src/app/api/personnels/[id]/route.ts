import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'AUTHORITY') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check if record exists
    const existing = await prisma.personnel.findUnique({
      where: { id },
      include: { _count: { select: { assignments: true } } }
    });

    if (!existing) {
      return NextResponse.json({ error: "Personnel not found" }, { status: 404 });
    }

    if (existing._count.assignments > 0) {
      // Deactivate instead of hard delete if assigned to historical records
      await prisma.personnel.update({
        where: { id },
        data: { active: false },
      });
      return NextResponse.json({ success: true, deactivated: true });
    }

    await prisma.personnel.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete personnel:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'AUTHORITY') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const updated = await prisma.personnel.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name.trim() }),
        ...(body.role && { role: body.role.trim() }),
        ...(body.contact && { contact: body.contact.trim() }),
        ...(body.active !== undefined && { active: Boolean(body.active) }),
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update personnel:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
