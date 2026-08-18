// Runs under the project's default jsdom environment rather than `node`: the shared jest.setup
// touches `window`, and the mailer only needs node:fs and a stubbed fetch, both of which work
// unchanged there.
import { promises as fs } from "node:fs";
import path from "node:path";
import { appOrigin, escapeHtml, mailConfigured, mailTransportName, passwordResetCodeEmail, sendMail, verificationEmail } from "../../app/lib/mailer";

const outboxPath = path.join(process.cwd(), "app", "data", "outbox.json");

const MESSAGE = { to: "reader@example.com", subject: "Hello", html: "<p>Hi</p>", text: "Hi" };

async function readOutbox(): Promise<Record<string, unknown>[]> {
  try {
    return JSON.parse(await fs.readFile(outboxPath, "utf8"));
  } catch {
    return [];
  }
}

describe("mailer", () => {
  const env = { ...process.env };

  beforeEach(async () => {
    for (const key of ["RESEND_API_KEY", "MAIL_FROM"]) {
      delete process.env[key];
    }
    await fs.rm(outboxPath, { force: true });
  });

  afterAll(async () => {
    process.env = env;
    await fs.rm(outboxPath, { force: true });
  });

  describe("configuration", () => {
    it("needs the key and nothing else, and names the transport in use", () => {
      expect(mailConfigured()).toBe(false);
      expect(mailTransportName()).toBeNull();

      // The key alone is enough: Resend sends from its shared address until a domain is verified.
      // Requiring MAIL_FROM as well is what left a deployment with a working key telling
      // locked-out readers that email was "not set up on this site yet".
      process.env.RESEND_API_KEY = "key";
      expect(mailConfigured()).toBe(true);
      expect(mailTransportName()).toBe("resend");

      // A sender without a key is not a provider, and there is nothing left to fall back to.
      delete process.env.RESEND_API_KEY;
      process.env.MAIL_FROM = "Stockers <hi@example.com>";
      expect(mailConfigured()).toBe(false);
      expect(mailTransportName()).toBeNull();
    });

    // The rules themselves live in app-origin.test.ts; this only pins that the mailer still
    // re-exports it, since the routes import it from here.
    it("builds links against the configured origin, without a trailing slash", () => {
      process.env.APP_URL = "https://stockers.example.com/";
      expect(appOrigin()).toBe("https://stockers.example.com");

      delete process.env.APP_URL;
      expect(appOrigin()).toBe("http://localhost:3000");
    });
  });

  describe("without a provider", () => {
    it("records the message locally and reports that it was not really sent", async () => {
      const result = await sendMail(MESSAGE);

      expect(result).toEqual({ ok: true, transport: "outbox" });
      const outbox = await readOutbox();
      expect(outbox).toHaveLength(1);
      expect(outbox[0]).toMatchObject({ to: "reader@example.com", subject: "Hello" });
      expect(outbox[0].reason).toMatch(/No mail provider configured/);
    });

    it("keeps the newest message first and caps the file", async () => {
      await sendMail({ ...MESSAGE, subject: "first" });
      await sendMail({ ...MESSAGE, subject: "second" });

      const outbox = await readOutbox();
      expect(outbox.map((entry) => entry.subject)).toEqual(["second", "first"]);
    });

    it("starts a fresh outbox when the existing one is not readable as a list", async () => {
      await fs.mkdir(path.dirname(outboxPath), { recursive: true });
      await fs.writeFile(outboxPath, "{ not an array }", "utf8");

      await expect(sendMail(MESSAGE)).resolves.toEqual({ ok: true, transport: "outbox" });
      expect(await readOutbox()).toHaveLength(1);
    });
  });

  describe("with a provider", () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = "key";
      process.env.MAIL_FROM = "Stockers <hi@example.com>";
    });

    it("posts the message and reports a real delivery", async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("") });
      global.fetch = fetchMock as unknown as typeof fetch;

      await expect(sendMail(MESSAGE)).resolves.toEqual({ ok: true, transport: "resend" });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.resend.com/emails");
      expect(init.headers.Authorization).toBe("Bearer key");
      expect(JSON.parse(init.body)).toEqual({
        from: "Stockers <hi@example.com>",
        to: ["reader@example.com"],
        subject: "Hello",
        html: "<p>Hi</p>",
        text: "Hi",
      });
      // Nothing was written locally, because it really went out.
      expect(await readOutbox()).toHaveLength(0);
    });

    it("keeps a refused message rather than dropping it, and says it failed", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 422, text: () => Promise.resolve("domain not verified") }) as unknown as typeof fetch;

      const result = await sendMail(MESSAGE);

      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/422/);
      const outbox = await readOutbox();
      expect(outbox).toHaveLength(1);
      expect(outbox[0].reason).toMatch(/domain not verified/);
    });

    it("keeps the message when the provider cannot be reached at all", async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

      const result = await sendMail(MESSAGE);

      expect(result.ok).toBe(false);
      expect(result.transport).toBe("resend");
      expect(result.error).toMatch(/ECONNREFUSED/);
      expect((await readOutbox())[0].reason).toMatch(/ECONNREFUSED/);
    });

    it("never rejects, so a mail outage cannot fail a sign-up", async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error("boom")) as unknown as typeof fetch;
      await expect(sendMail(MESSAGE)).resolves.toMatchObject({ ok: false });
    });
  });
});

describe("escapeHtml", () => {
  it("neutralises every character that could break out of the markup", () => {
    expect(escapeHtml(`<script>&"'`)).toBe("&lt;script&gt;&amp;&quot;&#39;");
  });
});

describe("verificationEmail", () => {
  it("addresses the reader by name and carries the link in both bodies", () => {
    const mail = verificationEmail({ name: "Aarav", verifyUrl: "https://example.com/verify?token=abc" });

    expect(mail.subject).toContain("Confirm your email");
    expect(mail.html).toContain("Aarav");
    expect(mail.html).toContain("https://example.com/verify?token=abc");
    // The plain-text part matters: some clients show only that, and it must still be actionable.
    expect(mail.text).toContain("https://example.com/verify?token=abc");
  });

  it("escapes a name that would otherwise inject markup", () => {
    const mail = verificationEmail({ name: '<img src=x onerror="alert(1)">', verifyUrl: "https://example.com/v" });

    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
  });

});


const PROVIDER_KEYS = ["RESEND_API_KEY", "MAIL_FROM"];

/**
 * The sender address, which is the one part of Resend's setup that is optional.
 *
 * Worth its own block because the fallback is not free: mail from the shared address reaches only
 * the account owner, so a deployment that never sets MAIL_FROM can recover its own admin account
 * and nobody else's.
 */
describe("sender address", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const key of PROVIDER_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    await fs.rm(outboxPath, { force: true });
  });

  afterEach(async () => {
    for (const key of PROVIDER_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await fs.rm(outboxPath, { force: true });
  });

  it("sends from Resend's shared address when no MAIL_FROM is set", async () => {
    // The regression this pins: a key with no sender used to count as no provider at all, so the
    // reset code went to the local outbox and the recovery panel called email unconfigured.
    process.env.RESEND_API_KEY = "resend-key";
    const sent: Record<string, unknown>[] = [];
    global.fetch = jest.fn(async (_url: unknown, init: unknown) => {
      sent.push(JSON.parse((init as { body: string }).body));
      return { ok: true, status: 200, text: async () => "" };
    }) as unknown as typeof fetch;

    await expect(sendMail(MESSAGE)).resolves.toEqual({ ok: true, transport: "resend" });

    expect(sent[0].from).toBe("StockersAI <onboarding@resend.dev>");
    expect(await readOutbox()).toHaveLength(0);
  });

  it("prefers an explicit MAIL_FROM over the shared address", async () => {
    process.env.RESEND_API_KEY = "resend-key";
    process.env.MAIL_FROM = "Stockers <hi@example.com>";
    const sent: Record<string, unknown>[] = [];
    global.fetch = jest.fn(async (_url: unknown, init: unknown) => {
      sent.push(JSON.parse((init as { body: string }).body));
      return { ok: true, status: 200, text: async () => "" };
    }) as unknown as typeof fetch;

    await sendMail(MESSAGE);

    expect(sent[0].from).toBe("Stockers <hi@example.com>");
  });

  it("records the refusal in the provider's own words when the domain is not verified", async () => {
    // What the shared address actually costs, and the sentence an operator needs to see to know
    // that verifying a domain is the fix.
    process.env.RESEND_API_KEY = "resend-key";
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => "You can only send testing emails to your own email address",
    })) as unknown as typeof fetch;

    const result = await sendMail(MESSAGE);

    expect(result).toMatchObject({ ok: false, transport: "resend" });
    expect(String((await readOutbox())[0].reason)).toContain("your own email address");
  });
});

describe("the recovery code mail", () => {
  it("puts the code in the subject as well as the body, so it can be read without opening it", () => {
    const mail = passwordResetCodeEmail({ name: "Aarav", code: "123456", minutes: 15 });

    expect(mail.subject).toContain("123456");
    expect(mail.text).toContain("123456");
    expect(mail.html).toContain("123456");
    // Linkless on purpose: it has to survive a client that strips them.
    expect(mail.text).not.toContain("http");
  });
});
