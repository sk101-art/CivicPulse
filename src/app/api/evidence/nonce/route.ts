import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/auth";
import { generateEvidenceNonce } from "@/lib/evidence/nonce";

export async function POST() {
  const auth = await withAuth();
  if (auth.error) {
    return auth.error;
  }

  const { nonce, expiresAt } = await generateEvidenceNonce(auth.user.id);

  return NextResponse.json(
    {
      nonce,
      expiresAt: expiresAt.toISOString(),
    },
    { status: 201 }
  );
}
