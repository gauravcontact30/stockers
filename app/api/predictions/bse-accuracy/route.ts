import { NextResponse } from "next/server";
import { getBseAiPredictionAccuracy } from "../../../lib/bse-ai-prediction-accuracy";

/**
 * The same five minutes the scheduled lock gets, for the one path that needs it.
 *
 * Almost every call here is a read of a list somebody else already built and answers in
 * milliseconds. The exception is the morning the scheduler did not fire: between 8:50 and the 3:30
 * close this route will build the day's list itself rather than leave the page on yesterday's, and
 * that is the same three model calls the cron makes. On the host default it would be killed part
 * way through and the page would fall back again on the next load, forever.
 */
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json(await getBseAiPredictionAccuracy(), {
    headers: { "Cache-Control": "no-store" },
  });
}
