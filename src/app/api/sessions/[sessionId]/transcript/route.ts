import { NextResponse } from "next/server";
import { getTraceReader } from "@/core/trace";
import { loadSessionHistory } from "@/core/session-history";
import { buildPreferredTranscriptPayload } from "@/core/session-transcript";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const [history, traces] = await Promise.all([
    loadSessionHistory(sessionId, { consolidated: true }),
    getTraceReader(process.cwd()).query({ sessionId }),
  ]);

  return NextResponse.json(
    buildPreferredTranscriptPayload({ sessionId, history, traces }),
    { headers: { "Cache-Control": "no-store" } },
  );
}
