import { POST as issueActionsPOST } from "@/app/api/issues/[id]/actions/route";

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  return issueActionsPOST(req, context);
}
