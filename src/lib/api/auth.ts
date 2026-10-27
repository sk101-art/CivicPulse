import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiError, ApiErrorBody } from "./errors";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  name?: string | null;
}

export type AuthResult =
  | { user: SessionUser; error: null }
  | { user: null; error: NextResponse<ApiErrorBody> };

export async function withAuth(requiredRole?: Role): Promise<AuthResult> {
  const session = await getServerSession(authOptions);

  if (!session || !session.user || !session.user.id) {
    return {
      user: null,
      error: apiError(401, "UNAUTHORIZED", "Authentication required to access this endpoint"),
    };
  }

  if (requiredRole && session.user.role !== requiredRole) {
    return {
      user: null,
      error: apiError(
        403,
        "FORBIDDEN",
        `Access forbidden: requires ${requiredRole} privileges`
      ),
    };
  }

  return {
    user: session.user,
    error: null,
  };
}
