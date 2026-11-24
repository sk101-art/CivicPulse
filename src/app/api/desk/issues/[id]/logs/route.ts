import { GET as issueLogGET } from "@/app/api/issues/[id]/log/route";

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  return issueLogGET(req, context);
}
