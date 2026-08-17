import { promises as fs } from "node:fs";
import path from "node:path";
import { passwordResetSms, sendSms, smsConfigured, smsTransportName, subscriptionSms, toE164, twilioConfig, welcomeSms } from "../../app/lib/sms";

const outboxPath = path.join(process.cwd(), "app", "data", "sms-outbox.json");

async function readOutbox(): Promise<{ to: string; body: string; reason: string }[]> {
  try {
    return JSON.parse(await fs.readFile(outboxPath, "utf8"));
  } catch {
    return [];
  }
}

const KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM",
  "FAST2SMS_API_KEY",
  "MSG91_AUTH_KEY",
  "MSG91_SENDER_ID",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  await fs.rm(outboxPath, { force: true });
});

afterEach(async () => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await fs.rm(outboxPath, { force: true });
});

describe("toE164", () => {
  // A gateway will only accept E.164, and these are all the same Indian number.
  it("turns every way a number is written into one international form", () => {
    for (const typed of ["9876543210", "+91 98765 43210", "09876543210", "98765-43210"]) {
      expect(toE164(typed)).toBe("+919876543210");
    }
  });

  it("refuses anything that could not be an Indian mobile", () => {
    expect(toE164("5876543210")).toBeNull();
    expect(toE164("12345")).toBeNull();
    expect(toE164("")).toBeNull();
  });
});

describe("twilioConfig", () => {
  it("reports nothing configured when a credential is missing", () => {
    expect(twilioConfig()).toBeNull();
    expect(smsConfigured()).toBe(false);

    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    expect(smsConfigured()).toBe(false);

    process.env.TWILIO_FROM = "+15005550006";
    expect(smsConfigured()).toBe(true);
    expect(twilioConfig()).toEqual({ accountSid: "AC123", authToken: "secret", from: "+15005550006" });
  });
});

describe("sendSms", () => {
  /**
   * A sign-up must not fail because an SMS gateway is missing. With nothing configured the message
   * is written to a local log instead, so a developer can still read what would have gone out.
   */
  it("records to the outbox when no gateway is configured", async () => {
    const result = await sendSms({ to: "9876543210", body: "hello" });

    expect(result).toEqual({ ok: true, transport: "outbox", error: "No SMS gateway configured" });
    expect(await readOutbox()).toEqual([
      expect.objectContaining({ to: "9876543210", body: "hello", reason: "No SMS gateway configured" }),
    ]);
  });

  it("refuses a number that is not a mobile, without writing anything", async () => {
    const result = await sendSms({ to: "12345", body: "hello" });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/valid Indian mobile/);
    expect(await readOutbox()).toEqual([]);
  });

  it("posts to the gateway in international form when it is configured", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_FROM = "+15005550006";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => "" } as Response);

    const result = await sendSms({ to: "98765 43210", body: "hello" });

    expect(result).toEqual({ ok: true, transport: "twilio" });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(String(init.body)).toContain("To=%2B919876543210");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("AC123:secret").toString("base64")}`);
  });

  // A refused or unreachable gateway is logged, not thrown — the caller is always doing something
  // more important than this.
  it("falls back to the outbox when the gateway refuses", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_FROM = "+15005550006";
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "unauthorised" } as Response);

    const result = await sendSms({ to: "9876543210", body: "hello" });

    expect(result.transport).toBe("outbox");
    expect(result.error).toMatch(/401/);
  });

  it("falls back to the outbox when the request never lands", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_FROM = "+15005550006";
    global.fetch = jest.fn().mockRejectedValue(new Error("socket hang up"));

    const result = await sendSms({ to: "9876543210", body: "hello" });

    expect(result.transport).toBe("outbox");
    expect(result.error).toMatch(/socket hang up/);
  });
});

describe("the message bodies", () => {
  /**
   * Written as fixed templates with the name as the only variable, so they can be registered with
   * DLT exactly as they appear. India drops commercial SMS that does not match a registered
   * template, and a gateway will accept the call and say nothing.
   */
  it("welcomes a new account without a link in it", () => {
    const body = welcomeSms("Aarav");
    expect(body).toContain("Aarav");
    expect(body).toMatch(/free trial/i);
    // A URL in an SMS is a phishing signal to the reader and a filtering signal to the carrier.
    expect(body).not.toMatch(/https?:\/\//);
  });

  it("confirms a subscription with its plan and the date it runs to", () => {
    const body = subscriptionSms({ name: "Aarav", plan: "Pro", until: "2026-09-08" });
    expect(body).toContain("Pro");
    expect(body).toContain("2026-09-08");
    expect(body).not.toMatch(/https?:\/\//);
  });
});

describe("gateway selection", () => {
  it("counts any one of the three gateways as configured, and names the one in use", () => {
    expect(smsConfigured()).toBe(false);
    expect(smsTransportName()).toBeNull();

    process.env.FAST2SMS_API_KEY = "fast2sms-key";
    expect(smsConfigured()).toBe(true);
    expect(smsTransportName()).toBe("fast2sms");

    // Twilio leads when both are set: see the gateway order in the module.
    process.env.TWILIO_ACCOUNT_SID = "sid";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_FROM = "+15550000000";
    expect(smsTransportName()).toBe("twilio");

    delete process.env.FAST2SMS_API_KEY;
    delete process.env.TWILIO_ACCOUNT_SID;
    process.env.MSG91_AUTH_KEY = "auth";
    process.env.MSG91_SENDER_ID = "STOCKR";
    expect(smsTransportName()).toBe("msg91");
  });

  it("sends the bare ten digits to an Indian gateway, not E.164", async () => {
    process.env.FAST2SMS_API_KEY = "fast2sms-key";
    const bodies: Record<string, unknown>[] = [];
    global.fetch = jest.fn(async (_url: unknown, init: unknown) => {
      bodies.push(JSON.parse((init as { body: string }).body));
      return { ok: true, status: 200, text: async () => '{"return":true}' };
    }) as unknown as typeof fetch;

    await expect(sendSms({ to: "+91 98765 43210", body: "hello" })).resolves.toEqual({ ok: true, transport: "fast2sms" });
    expect(bodies[0].numbers).toBe("9876543210");
  });

  it("treats a 200 that carries a refusal as a failure, and falls through to the next gateway", async () => {
    process.env.FAST2SMS_API_KEY = "fast2sms-key";
    process.env.MSG91_AUTH_KEY = "auth";
    process.env.MSG91_SENDER_ID = "STOCKR";
    const seen: string[] = [];
    global.fetch = jest.fn(async (url: unknown) => {
      seen.push(String(url));
      const fast2sms = String(url).includes("fast2sms");
      return { ok: true, status: 200, text: async () => (fast2sms ? '{"return":false,"message":"invalid key"}' : '{"type":"success"}') };
    }) as unknown as typeof fetch;

    await expect(sendSms({ to: "9876543210", body: "hello" })).resolves.toEqual({ ok: true, transport: "msg91" });
    expect(seen).toHaveLength(2);
  });

  it("records the message with every gateway's complaint when none of them takes it", async () => {
    process.env.FAST2SMS_API_KEY = "fast2sms-key";
    global.fetch = jest.fn(async () => ({ ok: false, status: 401, text: async () => "bad key" })) as unknown as typeof fetch;

    const result = await sendSms({ to: "9876543210", body: "hello" });

    expect(result.transport).toBe("outbox");
    expect((await readOutbox())[0].reason).toContain("fast2sms");
  });
});

describe("passwordResetSms", () => {
  it("is a fixed, linkless template with the code and its lifetime", () => {
    const body = passwordResetSms("123456", 15);

    expect(body).toContain("123456");
    expect(body).toContain("15 minutes");
    expect(body).not.toContain("http");
  });
});
