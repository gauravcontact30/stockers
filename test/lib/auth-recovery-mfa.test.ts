/** @jest-environment node */

import { promises as fs } from "node:fs";
import path from "node:path";
import { POST as forgotPassword } from "../../app/api/auth/forgot-password/route";
import { POST as resetPassword } from "../../app/api/auth/reset-password/route";
import { POST as signin } from "../../app/api/auth/signin/route";
import { POST as verifyMfa } from "../../app/api/auth/mfa/verify/route";
import { authenticateUser, createUser, updateUser } from "../../app/lib/store";
import { mailConfigured, passwordResetCodeEmail, passwordResetEmail, sendMail } from "../../app/lib/mailer";
import { passwordResetSms, sendSms } from "../../app/lib/sms";

jest.mock("../../app/lib/mailer", () => ({
  appOrigin: () => "http://localhost:3000",
  mailConfigured: jest.fn(() => true),
  passwordResetEmail: jest.fn(({ resetUrl }) => ({ subject: "reset", html: resetUrl, text: resetUrl })),
  passwordResetCodeEmail: jest.fn(({ code }) => ({ subject: `${code} is your code`, html: code, text: code })),
  sendMail: jest.fn(async () => ({ ok: true, transport: "resend" })),
}));

jest.mock("../../app/lib/sms", () => ({
  mfaOtpSms: jest.fn((code: string) => `Your code is ${code}`),
  passwordResetSms: jest.fn((code: string) => `Your reset code is ${code}`),
  smsConfigured: jest.fn(() => true),
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
  /** The six digits, as they were handed to the mailer. */
  function codeFromMail(): string {
    const call = (passwordResetCodeEmail as jest.Mock).mock.calls[0][0] as { code: string };
    return call.code;
  }

  it("sends one code over every channel the account has, and takes it back to set a password", async () => {
    await createUser({ name: "Aarav Sharma", email: "aarav@example.com", password: "Oldpass123", mobile: "9876543210" });

    const forgot = await postJson(forgotPassword, "/api/auth/forgot-password", { email: "aarav@example.com" });
    expect(forgot.status).toBe(200);

    // The code mail and the courtesy link mail, plus the SMS.
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendSms).toHaveBeenCalledTimes(1);
    const code = codeFromMail();
    expect(code).toMatch(/^\d{6}$/);
    expect((passwordResetSms as jest.Mock).mock.calls[0][0]).toBe(code);

    // Both destinations come back masked, and neither is the raw address.
    const body = (await forgot.json()) as { channels: { kind: string; target: string; state: string }[] };
    expect(body.channels).toEqual([
      { kind: "email", target: expect.stringContaining("@example.com"), state: "sent" },
      { kind: "sms", target: expect.stringContaining("3210"), state: "sent" },
    ]);
    expect(body.channels[0].target).not.toBe("aarav@example.com");

    const reset = await postJson(resetPassword, "/api/auth/reset-password", {
      email: "aarav@example.com",
      code,
      password: "Newpass123",
      confirmPassword: "Newpass123",
    });

    expect(reset.status).toBe(200);
    await expect(authenticateUser("aarav@example.com", "Oldpass123")).resolves.toBeNull();
    await expect(authenticateUser("aarav@example.com", "Newpass123")).resolves.toMatchObject({ email: "aarav@example.com" });
  });

  it("still accepts the link from the email, which carries the same code", async () => {
    await createUser({ name: "Aarav Sharma", email: "aarav@example.com", password: "Oldpass123" });
    await postJson(forgotPassword, "/api/auth/forgot-password", { email: "aarav@example.com" });

    const link = (passwordResetEmail as jest.Mock).mock.calls[0][0] as { resetUrl: string };
    const url = new URL(link.resetUrl);
    expect(url.searchParams.get("email")).toBe("aarav@example.com");

    const reset = await postJson(resetPassword, "/api/auth/reset-password", {
      email: url.searchParams.get("email"),
      code: url.searchParams.get("reset"),
      password: "Newpass123",
      confirmPassword: "Newpass123",
    });

    expect(reset.status).toBe(200);
  });

  it("refuses a wrong code, and destroys the code after five wrong guesses", async () => {
    await createUser({ name: "Aarav Sharma", email: "aarav@example.com", password: "Oldpass123" });
    await postJson(forgotPassword, "/api/auth/forgot-password", { email: "aarav@example.com" });
    const code = codeFromMail();
    const wrong = code === "000000" ? "111111" : "000000";

    for (let attempt = 0; attempt < 5; attempt++) {
      const bad = await postJson(resetPassword, "/api/auth/reset-password", {
        email: "aarav@example.com",
        code: wrong,
        password: "Newpass123",
        confirmPassword: "Newpass123",
      });
      expect(bad.status).toBe(400);
    }

    // The real code is worthless now: guessing burned it.
    const late = await postJson(resetPassword, "/api/auth/reset-password", {
      email: "aarav@example.com",
      code,
      password: "Newpass123",
      confirmPassword: "Newpass123",
    });

    expect(late.status).toBe(400);
    await expect(authenticateUser("aarav@example.com", "Oldpass123")).resolves.toMatchObject({ email: "aarav@example.com" });
  });

  it("reports a channel that could not deliver rather than claiming it was sent", async () => {
    (sendMail as jest.Mock).mockResolvedValue({ ok: true, transport: "outbox" });
    (mailConfigured as jest.Mock).mockReturnValue(false);
    await createUser({ name: "Aarav Sharma", email: "aarav@example.com", password: "Oldpass123" });

    const response = await postJson(forgotPassword, "/api/auth/forgot-password", { email: "aarav@example.com" });
    const body = (await response.json()) as { channels: { state: string }[]; message: string };

    expect(body.channels[0].state).toBe("unconfigured");
    expect(body.message).toContain("couldn't deliver");

    // These two are module-level mocks: left as they are, the next test inherits a broken mailer.
    (sendMail as jest.Mock).mockResolvedValue({ ok: true, transport: "resend" });
    (mailConfigured as jest.Mock).mockReturnValue(true);
  });

  it("does not reveal whether an unknown email exists", async () => {
    const response = await postJson(forgotPassword, "/api/auth/forgot-password", { email: "missing@example.com" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, channels: [] });
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
