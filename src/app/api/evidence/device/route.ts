import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/auth";
import { parseJson } from "@/lib/api/validate";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

const publicJwkSchema = z
  .object({
    kty: z.literal("EC"),
    crv: z.literal("P-256"),
    x: z.string().min(1, "x coordinate is required"),
    y: z.string().min(1, "y coordinate is required"),
  })
  .passthrough();

const registerDeviceKeySchema = z.object({
  publicJwk: publicJwkSchema,
});

export async function POST(req: Request) {
  const auth = await withAuth();
  if (auth.error) {
    return auth.error;
  }

  const parsed = await parseJson(req, registerDeviceKeySchema);
  if (parsed.error) {
    return parsed.error;
  }

  // Store only the public EC components; never persist any other JWK fields a client may send.
  const publicJwk = {
    kty: parsed.data.publicJwk.kty,
    crv: parsed.data.publicJwk.crv,
    x: parsed.data.publicJwk.x,
    y: parsed.data.publicJwk.y,
  };

  // Check if this public key is already registered for this user
  const existingKeys = await prisma.deviceKey.findMany({
    where: {
      userId: auth.user.id,
      revokedAt: null,
    },
  });

  const existing = existingKeys.find((k) => {
    const jwk = k.publicJwk as Record<string, unknown> | null;
    return jwk?.x === publicJwk.x && jwk?.y === publicJwk.y && jwk?.crv === publicJwk.crv;
  });

  if (existing) {
    return NextResponse.json(
      {
        deviceKey: existing,
        reused: true,
      },
      { status: 200 }
    );
  }

  const created = await prisma.deviceKey.create({
    data: {
      userId: auth.user.id,
      publicJwk: publicJwk as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json(
    {
      deviceKey: created,
      reused: false,
    },
    { status: 201 }
  );
}

export async function GET() {
  const auth = await withAuth();
  if (auth.error) {
    return auth.error;
  }

  const keys = await prisma.deviceKey.findMany({
    where: {
      userId: auth.user.id,
      revokedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return NextResponse.json({ keys }, { status: 200 });
}
