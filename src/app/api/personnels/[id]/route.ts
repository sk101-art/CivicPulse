import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enrichPersonnelRecord } from "@/lib/desk/personnelData";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updatePersonnelSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120).optional(),
  role: z.string().trim().min(2, "Role must be at least 2 characters").max(100).optional(),
  contact: z.string().trim().min(5, "Contact number must be at least 5 characters").max(40).optional(),
  active: z.boolean().optional(),
});

const ASSIGNMENT_ISSUE_INCLUDE = {
  assignments: {
    orderBy: { createdAt: "desc" as const },
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
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "AUTHORITY") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const personnel = await prisma.personnel.findUnique({
      where: { id },
      include: ASSIGNMENT_ISSUE_INCLUDE,
    });

    if (!personnel) {
      return NextResponse.json({ error: "Personnel not found" }, { status: 404 });
    }

    return NextResponse.json(enrichPersonnelRecord(personnel), {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("GET /api/personnels/[id] failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "AUTHORITY") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.personnel.findUnique({
      where: { id },
      include: { _count: { select: { assignments: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Personnel not found" }, { status: 404 });
    }

    if (existing._count.assignments > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.personnel.update({
          where: { id },
          data: { active: false },
        });
        await tx.adminAudit.create({
          data: {
            actor: session.user.email || session.user.id,
            action: "PERSONNEL_DEACTIVATED",
            note: `Deactivated ${existing.name} (preserved ${existing._count.assignments} historical assignments)`,
            details: { personnelId: id },
          },
        });
      });
      return NextResponse.json({ success: true, deactivated: true });
    }

    await prisma.$transaction(async (tx) => {
      await tx.personnel.delete({ where: { id } });
      await tx.adminAudit.create({
        data: {
          actor: session.user.email || session.user.id,
          action: "PERSONNEL_DELETED",
          note: `Removed field personnel ${existing.name} (${existing.role})`,
          details: { personnelId: id },
        },
      });
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
    if (!session || session.user.role !== "AUTHORITY") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const json = await req.json().catch(() => null);
    const parsed = updatePersonnelSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid personnel update payload" },
        { status: 400 }
      );
    }

    const existing = await prisma.personnel.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Personnel not found" }, { status: 404 });
    }

    const { name, role, contact, active } = parsed.data;

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.personnel.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(role !== undefined ? { role } : {}),
          ...(contact !== undefined ? { contact } : {}),
          ...(active !== undefined ? { active } : {}),
        },
        include: ASSIGNMENT_ISSUE_INCLUDE,
      });

      const action =
        active !== undefined && active !== existing.active
          ? active
            ? "PERSONNEL_REACTIVATED"
            : "PERSONNEL_DEACTIVATED"
          : "PERSONNEL_UPDATED";

      await tx.adminAudit.create({
        data: {
          actor: session.user.email || session.user.id,
          action,
          note: `Updated field personnel ${p.name} (${p.role})`,
          details: {
            personnelId: p.id,
            previousActive: existing.active,
            nextActive: p.active,
          },
        },
      });

      return p;
    });

    return NextResponse.json(enrichPersonnelRecord(updated));
  } catch (error) {
    console.error("Failed to update personnel:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
