import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'AUTHORITY') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let personnels = await prisma.personnel.findMany({
      orderBy: { name: 'asc' }
    });

    // Seed baseline field roster if database table is empty
    if (personnels.length === 0) {
      const initialRoster = [
        { name: 'Ravi Kumar', role: 'Senior Field Engineer', contact: '+91 98765 43021', active: true },
        { name: 'Meera Nair', role: 'Road Works Supervisor', contact: '+91 98456 76120', active: true },
        { name: 'Arjun Patel', role: 'Drainage Technician', contact: '+91 99879 22109', active: true },
        { name: 'S. Ramesh', role: 'Electrical Maintenance Lead', contact: '+91 98123 77090', active: true },
      ];

      for (const p of initialRoster) {
        await prisma.personnel.create({ data: p });
      }

      personnels = await prisma.personnel.findMany({
        orderBy: { name: 'asc' }
      });
    }

    return NextResponse.json(personnels);
  } catch (error) {
    console.error("Failed to fetch personnels:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'AUTHORITY') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, role, contact, active } = await req.json();
    if (!name || !contact) {
      return NextResponse.json({ error: "Name and contact are required" }, { status: 400 });
    }

    const personnel = await prisma.personnel.create({
      data: {
        name: name.trim(),
        role: (role || 'Field Officer').trim(),
        contact: contact.trim(),
        active: active !== false,
      }
    });

    return NextResponse.json(personnel, { status: 201 });
  } catch (error) {
    console.error("Failed to create personnel:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
