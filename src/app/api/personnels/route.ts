import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'AUTHORITY') {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const personnels = await prisma.personnel.findMany({
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(personnels);
  } catch (error) {
    console.error("Failed to fetch personnels:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'AUTHORITY') {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { name, role, contact } = await req.json();

    const personnel = await prisma.personnel.create({
      data: {
        name,
        role,
        contact,
      }
    });

    return NextResponse.json(personnel);
  } catch (error) {
    console.error("Failed to create personnel:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
