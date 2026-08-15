import { NextRequest, NextResponse } from "next/server";
import { cacheHeaders } from "../../../../lib/cache";
import { getBseDirectory, type BseCapTier, type DirectoryQuery } from "../../../../lib/bse-market";

const TIERS: (BseCapTier | "all")[] = ["all", "Large", "Mid", "Small"];
const SORTS: NonNullable<DirectoryQuery["sort"]>[] = ["mcap", "change", "name", "price"];

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const DIRECTIONS = ["asc", "desc"] as const;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Number.parseInt(params.get("page") ?? "1", 10);

  const directory = await getBseDirectory({
    q: params.get("q") ?? undefined,
    tier: pick(params.get("tier"), TIERS, "all"),
    sort: pick(params.get("sort"), SORTS, "mcap"),
    direction: pick(params.get("direction"), DIRECTIONS, "desc"),
    page: Number.isFinite(page) ? page : 1,
  });

  return NextResponse.json(directory, {
    headers: cacheHeaders(60),
  });
}
