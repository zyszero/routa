import { NextRequest, NextResponse } from "next/server";
import {
  badRequest,
  requireParticipantAuth,
  resolveSharedSessionContext,
  serializeApproval,
  type SharedSessionRouteParams,
  toErrorResponse,
} from "../../_helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: SharedSessionRouteParams) {
  try {
    const { sharedSessionId, service } = await resolveSharedSessionContext(params);
    const body = await request.json() as {
      participantId?: string;
      participantToken?: string;
      prompt?: string;
    };
    const auth = requireParticipantAuth(body);
    if (auth instanceof NextResponse) {
      return auth;
    }
    if (typeof body.prompt !== "string") {
      return badRequest("prompt is required");
    }
    const result = service.sendPrompt({
      sharedSessionId,
      participantId: auth.participantId,
      participantToken: auth.participantToken,
      prompt: body.prompt,
    });

    return NextResponse.json({
      status: result.status,
      approval: result.approval ? serializeApproval(result.approval) : null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
