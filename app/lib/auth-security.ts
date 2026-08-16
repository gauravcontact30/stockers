import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type MfaMode = "off" | "sms" | "totp";
export type SocialProvider = "google" | "facebook" | "instagram";

const DEV_AUTH_SECRET = "stockers-dev-only-insecure-secret";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

function secret(): string {
  const configured = process.env.AUTH_TOKEN_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_TOKEN_SECRET must be set to at least 32 characters in production.");
  }
  return DEV_AUTH_SECRET;
}

function hmac(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function equalText(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function hashOneTimeCode(code: string): string {
  return hmac(code.trim());
}

export function verifyOneTimeCode(code: string, hash: string | null | undefined): boolean {
  if (!hash) return false;
  return equalText(hashOneTimeCode(code), hash);
}

type MfaChallenge = {
  userId: string;
  mode: Exclude<MfaMode, "off">;
  exp: number;
};

export function createMfaChallenge(userId: string, mode: Exclude<MfaMode, "off">): string {
  const payload: MfaChallenge = { userId, mode, exp: Date.now() + 5 * 60 * 1000 };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function verifyMfaChallenge(token: string): MfaChallenge | null {
  const [body, signature] = token.split(".");
  if (!body || !signature || !equalText(hmac(body), signature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as MfaChallenge;
    if (!payload.userId || (payload.mode !== "sms" && payload.mode !== "totp")) return null;
    if (!Number.isFinite(payload.exp) || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");

  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += BASE32[parseInt(chunk, 2)];
  }
  return output;
}

function decodeBase32(value: string): Buffer {
  const cleaned = value.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = "";
  for (const char of cleaned) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error("Invalid base32 secret.");
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpForCounter(secretValue: string, counter: number): string {
  const key = decodeBase32(secretValue);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac("sha1", key).update(msg).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) %
    10 ** TOTP_DIGITS;
  return String(code).padStart(TOTP_DIGITS, "0");
}

export function verifyTotpCode(secretValue: string | null | undefined, code: string): boolean {
  if (!secretValue || !/^\d{6}$/.test(code.trim())) return false;
  const nowCounter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  return [-1, 0, 1].some((offset) => totpForCounter(secretValue, nowCounter + offset) === code.trim());
}

export function totpUri(params: { issuer: string; account: string; secret: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.account}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

export function newOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function createOAuthState(provider: SocialProvider): string {
  const payload = Buffer.from(
    JSON.stringify({ provider, nonce: randomBytes(16).toString("hex"), exp: Date.now() + 10 * 60 * 1000 }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export function verifyOAuthState(state: string, provider: SocialProvider): boolean {
  const [payload, signature] = state.split(".");
  if (!payload || !signature || !equalText(hmac(payload), signature)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      provider?: string;
      exp?: number;
    };
    return parsed.provider === provider && Number.isFinite(parsed.exp) && Number(parsed.exp) >= Date.now();
  } catch {
    return false;
  }
}
