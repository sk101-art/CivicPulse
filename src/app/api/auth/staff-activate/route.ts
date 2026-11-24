import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const activateSchema = z.object({
  token: z.string().min(10, 'Valid invitation token is required'),
  name: z.string().trim().min(1, 'Full name is required').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = activateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid details' }, { status: 400 });
    }

    const { token, name, password } = parsed.data;

    // 1. Verify invitation token
    const invitation = await prisma.staffInvitation.findUnique({
      where: { token },
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invalid or unrecognized invitation token.' }, { status: 400 });
    }

    if (invitation.usedAt) {
      return NextResponse.json(
        { error: 'This invitation token has already been activated. Please sign in.' },
        { status: 400 }
      );
    }

    if (new Date() > invitation.expiresAt) {
      return NextResponse.json(
        { error: 'This invitation token has expired. Please contact your municipal administrator.' },
        { status: 400 }
      );
    }

    // 2. Hash staff password securely
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. Atomically upsert staff account with AUTHORITY role and mark invitation used
    const user = await prisma.$transaction(async (tx) => {
      // Mark invitation used
      await tx.staffInvitation.update({
        where: { id: invitation.id },
        data: { usedAt: new Date() },
      });

      // Upsert User with role AUTHORITY
      return await tx.user.upsert({
        where: { email: invitation.email },
        create: {
          email: invitation.email,
          name,
          passwordHash,
          role: 'AUTHORITY',
          isActive: true,
        },
        update: {
          name,
          passwordHash,
          role: 'AUTHORITY',
          isActive: true,
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: 'Staff account activated successfully. You can now sign in through the Municipal Staff Portal.',
      email: user.email,
    });
  } catch (err: unknown) {
    console.error('Error activating staff account:', err);
    return new NextResponse('Internal server error during account activation', { status: 500 });
  }
}
