import { NextResponse } from "next/server";

const marketNews = [
  {
    title: "Banking sector benefits from stable RBI liquidity cues",
    summary: "Analysts expect selective upside in lenders with solid capital positions.",
    sentiment: "Positive",
  },
  {
    title: "IT majors face cautious outlook on discretionary spending",
    summary: "Near-term demand conversations remain mixed despite resilient deal pipelines.",
    sentiment: "Neutral",
  },
  {
    title: "Energy names rally on stronger crude price support",
    summary: "Commodity strength is improving the earnings outlook for upstream players.",
    sentiment: "Positive",
  },
  {
    title: "Auto stocks remain volatile ahead of policy updates",
    summary: "Investors are watching export and inventory signals closely.",
    sentiment: "Mixed",
  },
];

export async function GET() {
  return NextResponse.json(marketNews);
}
