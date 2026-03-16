import { NextRequest, NextResponse } from "next/server";
import {
  requireInviteJoinInput,
  resolveSharedSessionContext,
  serializeParticipant,
  serializeSession,
  type SharedSessionRouteParams,
  toErrorResponse,
} from "../../_helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: SharedSessionRouteParams) {
  try {
    const { sharedSessionId, service } = await resolveSharedSessionContext(params);
    const body = await request.json() as {
      inviteToken?: string;
      userId?: string;
      displayName?: string;
      role?: "collaborator" | "viewer";
    };
    const joinInput = requireInviteJoinInput(body);
    if (joinInput instanceof NextResponse) {
      return joinInput;
    }
    const { session, participant } = service.joinSession({
      sharedSessionId,
      inviteToken: joinInput.inviteToken,
      userId: joinInput.userId,
      displayName: joinInput.displayName,
      role: joinInput.role,
    });

    return NextResponse.json({
      session: serializeSession(session),
      participant: serializeParticipant(participant, true),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
