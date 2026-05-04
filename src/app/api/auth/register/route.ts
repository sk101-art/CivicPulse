import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return new NextResponse("Missing fields", { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
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
          role: 'CITIZEN',
        },
      });

      await tx.citizenProfile.create({
        data: {
          userId: newUser.id,
          reputation: 0,
          tier: 'NEWBIE',
        },
      });

      return newUser;
    });

    return NextResponse.json({ id: user.id, email: user.email });
  } catch (error) {
    console.error("REGISTRATION_ERROR", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
