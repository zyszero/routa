import { NextRequest, NextResponse } from "next/server";
import {
  requireParticipantAuth,
  resolveSharedSessionContext,
  serializeParticipant,
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
    };
    const auth = requireParticipantAuth(body);
    if (auth instanceof NextResponse) {
      return auth;
    }
    const participant = service.leaveSession({
      sharedSessionId,
      participantId: auth.participantId,
      participantToken: auth.participantToken,
    });

    return NextResponse.json({
      participant: serializeParticipant(participant, false),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
