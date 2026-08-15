import { NextResponse } from "next/server";
import { guardFeature, lockedResponse } from "../../../lib/feature-guard";
import { isFeatureKey } from "../../../lib/subscription";
import { streamVerdicts } from "../../../lib/stock-verdicts";

// One panel per dashboard section, each asking about the handful of stocks that section is
// already showing. More than this and the panel stops being a summary.
const MAX_SYMBOLS = 6;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  // The caller names the section it is speaking for, and the paywall is applied against that
  // section's own feature — so a locked screener cannot be read through this endpoint instead.
  const feature = typeof body?.feature === "string" ? body.feature : "";
  if (!isFeatureKey(feature)) {
    return NextResponse.json({ error: "a known feature is required" }, { status: 400 });
  }

  const guard = await guardFeature(request, feature);
  if (!guard.allowed) return lockedResponse(guard, feature);

  const symbols = Array.isArray(body?.symbols)
    ? body.symbols.filter((symbol: unknown): symbol is string => typeof symbol === "string").slice(0, MAX_SYMBOLS)
    : [];

  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols must list at least one stock" }, { status: 400 });
  }

  // Newline-delimited JSON, one frame per line, for the same reason the board-read route uses it:
  // the calls are decided by arithmetic and are ready in the time it takes to read the returns,
  // while the prose over them costs a model call that is allowed twenty-five seconds. Answering
  // with a single object made every reader wait for the second thing to see the first. A cached
  // set still arrives in one go — its one frame is written before the first flush.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const frame of streamVerdicts(symbols)) {
          controller.enqueue(encoder.encode(`${JSON.stringify(frame)}\n`));
        }
      } catch (error) {
        // Usually the reader navigating away mid-stream. The connection closes below either way,
        // and a set with no rationales yet is exactly what the panel already renders.
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
