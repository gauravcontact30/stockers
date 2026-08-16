import type { NextRequest } from "next/server";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

export function isSameOriginRequest(request: Request): boolean {
  const targetHost = new URL(request.url).host;
  const originHost = hostOf(request.headers.get("origin"));
  if (originHost) return originHost === targetHost;

  const refererHost = hostOf(request.headers.get("referer"));
  if (refererHost) return refererHost === targetHost;

  return true;
}

export function csrfFailureReason(request: NextRequest): string | null {
  if (!isMutatingMethod(request.method)) return null;

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return "Cross-site API mutation blocked.";

  return isSameOriginRequest(request) ? null : "API mutation must come from the same origin.";
}

