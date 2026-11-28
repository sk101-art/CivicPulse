import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listEnrichedPersonnels, enrichPersonnelRecord } from "@/lib/desk/personnelData";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createPersonnelSchema = z.object({
  name: z.string().trim().min(2, "Full name must be at least 2 characters").max(120),
  role: z.string().trim().min(2, "Role / specialization is required").max(100).default("Field Officer"),
  contact: z.string().trim().min(5, "Valid contact number is required").max(40),
  active: z.boolean().optional(),
});

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "AUTHORITY") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const role = searchParams.get("role") || undefined;
    const status = searchParams.get("status") || undefined;

    let personnels = await listEnrichedPersonnels({ search, role, status });

    // Seed baseline field roster only if database table is completely empty and unfiltered
    if (personnels.length === 0 && !search && (!role || role === "ALL") && (!status || status === "ALL")) {
      const totalCount = await prisma.personnel.count();
      if (totalCount === 0) {
        const initialRoster = [
          { name: "Ravi Kumar", role: "Senior Field Engineer", contact: "+91 98765 43021", active: true },
          { name: "Meera Nair", role: "Road Works Supervisor", contact: "+91 98456 76120", active: true },
          { name: "Arjun Patel", role: "Drainage Technician", contact: "+91 99879 22109", active: true },
          { name: "S. Ramesh", role: "Electrical Maintenance Lead", contact: "+91 98123 77090", active: true },
        ];

        for (const p of initialRoster) {
          await prisma.personnel.create({ data: p });
        }

        personnels = await listEnrichedPersonnels({ search, role, status });
      }
    }

    return NextResponse.json(personnels, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Failed to fetch personnels:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "AUTHORITY") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json().catch(() => null);
    const parsed = createPersonnelSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid personnel data" },
        { status: 400 }
      );
    }

    const { name, role, contact, active } = parsed.data;
    const normalizedContact = contact.replace(/\s+/g, "");

    // Prevent duplicate employees by contact or exact name+role
    const existingList = await prisma.personnel.findMany({
      where: {
        OR: [
          { contact: { equals: contact, mode: "insensitive" } },
          {
            AND: [
              { name: { equals: name, mode: "insensitive" } },
              { role: { equals: role, mode: "insensitive" } },
            ],
          },
        ],
      },
      take: 1,
    });

    if (existingList.length === 0) {
      // Also check whitespace-normalized phone match
      const allContacts = await prisma.personnel.findMany({
        select: { id: true, contact: true },
      });
      const phoneDup = allContacts.find(
        (c) => c.contact.replace(/\s+/g, "").toLowerCase() === normalizedContact.toLowerCase()
      );
      if (phoneDup) {
        return NextResponse.json(
          { error: "A personnel record with this contact number already exists." },
          { status: 409 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "A personnel record with this name/role or contact already exists." },
        { status: 409 }
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const personnel = await tx.personnel.create({
        data: {
          name,
          role,
          contact,
          active: active !== false,
        },
        include: {
          assignments: {
            include: {
              issue: {
                select: {
                  id: true,
                  category: true,
                  address: true,
                  status: true,
                  priority: true,
                  band: true,
                  bandOverride: true,
                  slaDueAt: true,
                  slaBreached: true,
                },
              },
            },
          },
        },
      });

      await tx.adminAudit.create({
        data: {
          actor: session.user.email || session.user.id,
          action: "PERSONNEL_CREATED",
          note: `Created field personnel ${personnel.name} (${personnel.role})`,
          details: { personnelId: personnel.id, role: personnel.role },
        },
      });

      return personnel;
    });

    return NextResponse.json(enrichPersonnelRecord(created), { status: 201 });
  } catch (error) {
    console.error("Failed to create personnel:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
