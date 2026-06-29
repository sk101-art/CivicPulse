import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { name, email, password, role } = await req.json();

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
    const userRole = role === 'AUTHORITY' ? 'AUTHORITY' : 'CITIZEN';

    const user = await prisma.$transaction(async (tx) => {
      let departmentId = undefined;
      if (userRole === 'AUTHORITY') {
        let dept = await tx.department.findUnique({ where: { code: 'PWD' } });
        if (!dept) dept = await tx.department.findFirst();
        if (dept) departmentId = dept.id;
      }

      const newUser = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: userRole,
          departmentId,
        },
      });

      if (userRole === 'CITIZEN') {
        await tx.citizenProfile.create({
          data: {
            userId: newUser.id,
            reputation: 0,
            tier: 'CITIZEN',
          },
        });
      }

      return newUser;
    });

    return NextResponse.json({ id: user.id, email: user.email });
  } catch (error) {
    console.error("REGISTRATION_ERROR", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
