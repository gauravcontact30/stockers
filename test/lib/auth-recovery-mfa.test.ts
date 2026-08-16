/** @jest-environment node */

import { promises as fs } from "node:fs";
import path from "node:path";
import { POST as forgotPassword } from "../../app/api/auth/forgot-password/route";
import { POST as resetPassword } from "../../app/api/auth/reset-password/route";
import { POST as signin } from "../../app/api/auth/signin/route";
import { POST as verifyMfa } from "../../app/api/auth/mfa/verify/route";
import { authenticateUser, createUser, updateUser } from "../../app/lib/store";
import { sendMail } from "../../app/lib/mailer";
import { sendSms } from "../../app/lib/sms";

jest.mock("../../app/lib/mailer", () => ({
  appOrigin: () => "http://localhost:3000",
  passwordResetEmail: jest.fn(({ resetUrl }) => ({ subject: "reset", html: resetUrl, text: resetUrl })),
  sendMail: jest.fn(async () => ({ ok: true, transport: "resend" })),
}));

jest.mock("../../app/lib/sms", () => ({
  mfaOtpSms: jest.fn((code: string) => `Your code is ${code}`),
  sendSms: jest.fn(async () => ({ ok: true, transport: "twilio" })),
}));

const usersPath = process.env.STOCKERS_USERS_FILE as string;
let original: string | null = null;

beforeAll(async () => {
  original = await fs.readFile(usersPath, "utf8").catch(() => null);
});

afterAll(async () => {
  if (original === null) {
    await fs.rm(usersPath, { force: true });
  } else {
    await fs.writeFile(usersPath, original, "utf8");
  }
});

beforeEach(async () => {
  await fs.mkdir(path.dirname(usersPath), { recursive: true });
  await fs.writeFile(usersPath, "[]", "utf8");
  jest.clearAllMocks();
});

function postJson(route: (request: Request) => Promise<Response>, pathName: string, body: unknown) {
  return route(
    new Request(`http://localhost${pathName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("password recovery", () => {
  it("emails a reset link and lets the user sign in with the new password", async () => {
    await createUser({ name: "Aarav Sharma", email: "aarav@example.com", password: "Oldpass123", mobile: "9876543210" });

    const forgot = await postJson(forgotPassword, "/api/auth/forgot-password", { email: "aarav@example.com" });
    expect(forgot.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);

    const message = (sendMail as jest.Mock).mock.calls[0][0] as { text: string };
    const token = new URL(message.text.trim().split("\n").find((line) => line.startsWith("http://")) ?? "").searchParams.get("reset");
    expect(token).toEqual(expect.any(String));

    const reset = await postJson(resetPassword, "/api/auth/reset-password", {
      token,
      password: "Newpass123",
      confirmPassword: "Newpass123",
    });

    expect(reset.status).toBe(200);
    await expect(authenticateUser("aarav@example.com", "Oldpass123")).resolves.toBeNull();
    await expect(authenticateUser("aarav@example.com", "Newpass123")).resolves.toMatchObject({ email: "aarav@example.com" });
  });

  it("does not reveal whether an unknown email exists", async () => {
    const response = await postJson(forgotPassword, "/api/auth/forgot-password", { email: "missing@example.com" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("SMS MFA sign-in", () => {
  it("requires the SMS code after a valid password and returns a session once verified", async () => {
    const user = await createUser({
      name: "Mira Rao",
      email: "mira@example.com",
      password: "Market123",
      mobile: "9876543210",
    });
    await updateUser(user!.id, { mfaMode: "sms" });

    const first = await postJson(signin, "/api/auth/signin", { email: "mira@example.com", password: "Market123" });
    const challenge = await first.json();

    expect(first.status).toBe(200);
    expect(challenge).toMatchObject({ mfaRequired: true, mode: "sms" });
    expect(sendSms).toHaveBeenCalledTimes(1);

    const sms = (sendSms as jest.Mock).mock.calls[0][0] as { body: string };
    const code = sms.body.match(/\d{6}/)?.[0];
    expect(code).toEqual(expect.any(String));

    const second = await postJson(verifyMfa, "/api/auth/mfa/verify", {
      challengeToken: challenge.challengeToken,
      code,
    });
    const session = await second.json();

    expect(second.status).toBe(200);
    expect(session.token).toEqual(expect.stringMatching(/^stockers\./));
    expect(session.user.email).toBe("mira@example.com");
  });
});
