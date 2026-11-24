import NextAuth from "next-auth/next";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export async function GET(req: any, ctx: any) {
  return handler(req, ctx);
}

export async function POST(req: any, ctx: any) {
  return handler(req, ctx);
}
