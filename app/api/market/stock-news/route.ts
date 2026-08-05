import { NextResponse } from "next/server";
import { getStockNews } from "../../../lib/nse-stock-news";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getStockNews());
}
