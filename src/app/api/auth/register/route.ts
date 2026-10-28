import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Public self-registration creates CITIZEN accounts only.
 * Desk (AUTHORITY) accounts are provisioned by the seed / an administrator, never via this endpoint,
 * regardless of any "role" field sent by the client.
 */
const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("A valid email is required").max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Request body must be valid JSON", { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "Invalid registration details";
    return new NextResponse(message, { status: 400 });
  }

  const { name, email, password } = parsed.data;

  try {
    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });

    if (existingUser) {
      return new NextResponse("User already exists", { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: "CITIZEN",
        },
      });

      await tx.citizenProfile.create({
        data: {
          userId: newUser.id,
          reputation: 0,
          tier: "CITIZEN",
        },
      });

      return newUser;
    });

    return NextResponse.json({ id: user.id, email: user.email });
  } catch (error) {
    console.error("REGISTRATION_ERROR", error instanceof Error ? error.message : error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
