import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { z } from 'zod';

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email address is required'),
  department: z.string().trim().optional(),
});

export async function POST(req: Request) {
  try {
    // 1. Authorization: Only authenticated municipal staff can provision staff accounts
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'AUTHORITY') {
      return new NextResponse('Access forbidden: municipal administrator privileges required', {
        status: 403,
      });
    }

    const body = await req.json().catch(() => null);
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid details' }, { status: 400 });
    }

    const { email, department } = parsed.data;

    // 2. Check if account already exists as staff
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    if (existing && existing.role === 'AUTHORITY') {
      return NextResponse.json(
        { error: 'An active municipal staff account already exists with this email address.' },
        { status: 400 }
      );
    }

    // 3. Generate cryptographically random single-use token with 7-day validity
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Upsert invitation: invalidate any prior unused invitation for this email
    const invitation = await prisma.staffInvitation.upsert({
      where: { email },
      create: {
        email,
        token,
        role: 'AUTHORITY',
        department: department || 'Municipal Administration',
        invitedBy: session.user.email || session.user.id,
        expiresAt,
      },
      update: {
        token,
        department: department || 'Municipal Administration',
        invitedBy: session.user.email || session.user.id,
        expiresAt,
        usedAt: null, // Reset used status on fresh invitation
      },
    });

    const inviteUrl = `/login/staff/activate?token=${token}`;

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        token: invitation.token,
        expiresAt: invitation.expiresAt,
        inviteUrl,
      },
    });
  } catch (err: unknown) {
    console.error('Failed to provision staff invitation:', err);
    return new NextResponse('Internal server error provisioning staff invitation', { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'AUTHORITY') {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const invitations = await prisma.staffInvitation.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        department: true,
        invitedBy: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ invitations });
  } catch (err: unknown) {
    console.error('Failed to list invitations:', err);
    return new NextResponse('Internal error', { status: 500 });
  }
}
