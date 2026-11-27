import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { withAuth } from "@/lib/api/auth";
import { apiError, formatZodError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters.")
    .max(80, "Display name must be 80 characters or fewer.")
    .refine((value) => !/[<>]/.test(value), "Display name contains invalid characters."),
});

/**
 * PATCH /api/citizen/profile
 * Updates the authenticated citizen's own display name.
 */
export async function PATCH(req: Request) {
  try {
    const auth = await withAuth(Role.CITIZEN);
    if (auth.error) {
      return auth.error;
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return apiError(400, "BAD_REQUEST", "Invalid JSON request body.");
    }

    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      const formatted = formatZodError(parsed.error);
      return apiError(400, formatted.code, formatted.message, formatted.fields);
    }

    const updated = await prisma.user.update({
      where: { id: auth.user.id },
      data: { name: parsed.data.name },
      select: {
        id: true,
        name: true,
        email: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("PATCH /api/citizen/profile failed:", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to update profile.");
  }
}
