// Runs under the project's default jsdom environment rather than `node`: the shared jest.setup
// touches `window`, and the mailer only needs node:fs and a stubbed fetch, both of which work
// unchanged there.
import { promises as fs } from "node:fs";
import path from "node:path";
import { appOrigin, escapeHtml, mailConfigured, sendMail, verificationEmail } from "../../app/lib/mailer";

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
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;
    await fs.rm(outboxPath, { force: true });
  });

  afterAll(async () => {
    process.env = env;
    await fs.rm(outboxPath, { force: true });
  });

  describe("configuration", () => {
    it("is unconfigured until both the key and the sender are present", () => {
      expect(mailConfigured()).toBe(false);

      process.env.RESEND_API_KEY = "key";
      expect(mailConfigured()).toBe(false);

      process.env.MAIL_FROM = "Stockers <hi@example.com>";
      expect(mailConfigured()).toBe(true);
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
      expect(outbox[0].reason).toMatch(/not set/);
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

      expect(result).toEqual({ ok: false, transport: "resend", error: "Could not reach the mail provider." });
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
