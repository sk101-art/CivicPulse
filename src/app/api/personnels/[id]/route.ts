import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'AUTHORITY') {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Optional: Check if personnel belongs to the user's department
    // For now, simple delete
    await prisma.personnel.delete({
      where: { id }
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete personnel:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
