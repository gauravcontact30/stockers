"use server";

import { cookies } from "next/headers";
import { getAuthorizedBseAiAnalysis, validateBseSecurityCode, type BseAiAnalysisResult } from "../lib/bse-ai-analysis";
import { findUserById, SESSION_COOKIE, verifyToken } from "../lib/store";

export type FetchBseAiAnalysisResult = BseAiAnalysisResult;

export async function fetchBseAiAnalysis(securityCodeInput: string): Promise<FetchBseAiAnalysisResult> {
  const validated = validateBseSecurityCode(securityCodeInput);
  if (!validated.ok) return validated;

  /**
   * Server Actions are callable endpoints. Page-level protection only protects page rendering; it
   * does not authenticate or authorize this action invocation, so the session and feature
   * entitlement are checked here before any internal service or LLM call is made.
   */
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const id = verifyToken(token);
  const user = id ? await findUserById(id) : null;

  return getAuthorizedBseAiAnalysis(validated.securityCode, user);
}
