import { NextResponse } from "next/server";
import { parseBrief, streamBoardRead } from "../../../lib/board-read";
import { guardFeature, lockedResponse } from "../../../lib/feature-guard";
import { isFeatureKey } from "../../../lib/subscription";

/**
 * The AI's read of one board, streamed.
 *
 * This used to await the whole completion and answer with a single JSON object, which meant the
 * panel sat on a placeholder for as long as the model took to finish — up to the 25s timeout. The
 * reply is now newline-delimited JSON, one frame per line, so the headline paints as soon as the
 * model has written it and each point appears underneath as it lands. A cached read still arrives
 * in one go: its frames are already known, so they are all written before the first flush.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  // Same rule as the verdicts route: the caller names the section it speaks for and is charged
  // against that section's own feature, so a locked board can't be read through this endpoint.
  const feature = typeof body?.feature === "string" ? body.feature : "";
  if (!isFeatureKey(feature)) {
    return NextResponse.json({ error: "a known feature is required" }, { status: 400 });
  }

  const guard = await guardFeature(request, feature);
  if (!guard.allowed) return lockedResponse(guard, feature);

  const brief = parseBrief(body?.brief);
  if (!brief) {
    return NextResponse.json({ error: "brief must carry a subject, a question and some figures" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const frame of streamBoardRead(brief)) {
          controller.enqueue(encoder.encode(`${JSON.stringify(frame)}\n`));
        }
      } catch (error) {
        // The reader may simply have navigated away mid-stream. Either way the connection is
        // closed below, and a half-written read is something the panel already handles.
        console.error(error);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Nginx and several hosting proxies buffer a response body by default, which would collect
      // the whole stream and deliver it at once — undoing the point of streaming it.
      "X-Accel-Buffering": "no",
    },
  });
}
