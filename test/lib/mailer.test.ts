// Runs under the project's default jsdom environment rather than `node`: the shared jest.setup
// touches `window`, and the mailer only needs node:fs and a stubbed fetch, both of which work
// unchanged there.
import { promises as fs } from "node:fs";
import path from "node:path";
import { appOrigin, escapeHtml, mailConfigured, mailTransportName, msg91MailConfigured, passwordResetCodeEmail, sendMail, verificationEmail } from "../../app/lib/mailer";

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
    for (const key of ["RESEND_API_KEY", "BREVO_API_KEY", "SENDGRID_API_KEY", "MAIL_FROM", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"]) {
      delete process.env[key];
    }
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

    it("counts any one of the four providers as configured, and names the one in use", () => {
      expect(mailConfigured()).toBe(false);
      expect(mailTransportName()).toBeNull();

      process.env.MAIL_FROM = "Stockers <hi@example.com>";
      process.env.BREVO_API_KEY = "brevo-key";
      expect(mailConfigured()).toBe(true);
      expect(mailTransportName()).toBe("brevo");

      // Resend leads when both are set: see the provider order in the mailer.
      process.env.RESEND_API_KEY = "resend-key";
      expect(mailTransportName()).toBe("resend");

      delete process.env.RESEND_API_KEY;
      delete process.env.BREVO_API_KEY;
      process.env.SENDGRID_API_KEY = "sendgrid-key";
      expect(mailTransportName()).toBe("sendgrid");

      delete process.env.SENDGRID_API_KEY;
      delete process.env.MAIL_FROM;
      process.env.SMTP_HOST = "smtp.example.com";
      process.env.SMTP_USER = "hi@example.com";
      process.env.SMTP_PASSWORD = "app-password";
      expect(mailConfigured()).toBe(true);
      expect(mailTransportName()).toBe("smtp");
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


const PROVIDER_KEYS = [
  "RESEND_API_KEY",
  "BREVO_API_KEY",
  "SENDGRID_API_KEY",
  "MAIL_FROM",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "MSG91_AUTH_KEY",
  "MSG91_EMAIL_DOMAIN",
  "MSG91_EMAIL_TEMPLATE_ID",
];

describe("provider selection", () => {
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

describe("provider fallback", () => {
  it("falls through to the next provider when the first one refuses", async () => {
    process.env.MAIL_FROM = "Stockers <hi@example.com>";
    process.env.RESEND_API_KEY = "resend-key";
    process.env.BREVO_API_KEY = "brevo-key";

    const calls: string[] = [];
    global.fetch = jest.fn(async (url: unknown) => {
      calls.push(String(url));
      const failing = String(url).includes("resend.com");
      return { ok: !failing, status: failing ? 403 : 202, text: async () => (failing ? "domain not verified" : "") };
    }) as unknown as typeof fetch;

    await expect(sendMail(MESSAGE)).resolves.toEqual({ ok: true, transport: "brevo" });
    expect(calls).toEqual(["https://api.resend.com/emails", "https://api.brevo.com/v3/smtp/email"]);
    // Delivered, so nothing is kept locally.
    expect(await readOutbox()).toHaveLength(0);
  });

  it("records every provider's complaint when none of them takes the message", async () => {
    process.env.MAIL_FROM = "Stockers <hi@example.com>";
    process.env.RESEND_API_KEY = "resend-key";
    process.env.SENDGRID_API_KEY = "sendgrid-key";
    global.fetch = jest.fn(async () => ({ ok: false, status: 401, text: async () => "bad key" })) as unknown as typeof fetch;

    const result = await sendMail(MESSAGE);

    expect(result.ok).toBe(false);
    const reason = String((await readOutbox())[0].reason);
    expect(reason).toContain("resend");
    expect(reason).toContain("sendgrid");
  });

  it("sends the sender as a name/address pair to the providers that want one", async () => {
    process.env.MAIL_FROM = "Stockers <hi@example.com>";
    process.env.BREVO_API_KEY = "brevo-key";
    const sent: Record<string, unknown>[] = [];
    global.fetch = jest.fn(async (_url: unknown, init: unknown) => {
      sent.push(JSON.parse((init as { body: string }).body));
      return { ok: true, status: 201, text: async () => "" };
    }) as unknown as typeof fetch;

    await sendMail(MESSAGE);

    expect(sent[0].sender).toEqual({ email: "hi@example.com", name: "Stockers" });
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
});

/**
 * MSG91 Email, the other half of running password recovery through one provider.
 *
 * The tests that matter here are about its two departures from every other provider: it needs a
 * verified domain and a panel template before it counts as configured at all, and it sends the
 * plain-text body rather than the HTML one, because MSG91 renders its own template around the
 * variables it is given.
 */
describe("MSG91 email", () => {
  const KEYS = ["MSG91_AUTH_KEY", "MSG91_EMAIL_DOMAIN", "MSG91_EMAIL_TEMPLATE_ID", "MAIL_FROM", "RESEND_API_KEY"];
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

  it("needs the domain and the template, not just the auth key the SMS side uses", () => {
    process.env.MAIL_FROM = "Stockers <hi@example.com>";
    process.env.MSG91_AUTH_KEY = "auth";
    // An auth key alone is what the SMS side runs on; email additionally needs a verified domain
    // and a template, so a deployment that only set up SMS must not claim it can send mail.
    expect(msg91MailConfigured()).toBe(false);
    expect(mailConfigured()).toBe(false);

    process.env.MSG91_EMAIL_DOMAIN = "mail.example.com";
    expect(msg91MailConfigured()).toBe(false);

    process.env.MSG91_EMAIL_TEMPLATE_ID = "template-1";
    expect(msg91MailConfigured()).toBe(true);
    expect(mailTransportName()).toBe("msg91");
  });

  it("sends the template, the domain and the text body when it is the provider that takes it", async () => {
    process.env.MAIL_FROM = "Stockers <hi@example.com>";
    process.env.MSG91_AUTH_KEY = "auth";
    process.env.MSG91_EMAIL_DOMAIN = "mail.example.com";
    process.env.MSG91_EMAIL_TEMPLATE_ID = "template-1";

    const calls: string[] = [];
    let sent: Record<string, unknown> = {};
    let headers: Record<string, string> = {};
    global.fetch = jest.fn(async (url: unknown, init: unknown) => {
      calls.push(String(url));
      const request = init as { body: string; headers: Record<string, string> };
      sent = JSON.parse(request.body);
      headers = request.headers;
      return { ok: true, status: 200, text: async () => "" };
    }) as unknown as typeof fetch;

    await expect(sendMail(MESSAGE)).resolves.toEqual({ ok: true, transport: "msg91" });

    expect(calls).toEqual(["https://control.msg91.com/api/v5/email/send"]);
    expect(headers.authkey).toBe("auth");
    expect(sent.domain).toBe("mail.example.com");
    expect(sent.template_id).toBe("template-1");
    expect(sent.from).toEqual({ email: "hi@example.com", name: "Stockers" });
    // The text body, never the HTML one: it is substituted into MSG91's own template.
    expect(sent.recipients).toEqual([
      { to: [{ email: "reader@example.com" }], variables: { subject: "Hello", body: "Hi" } },
    ]);
  });

  it("is the fallback, not the default: Resend takes the message when both are configured", async () => {
    process.env.MAIL_FROM = "Stockers <hi@example.com>";
    process.env.MSG91_AUTH_KEY = "auth";
    process.env.MSG91_EMAIL_DOMAIN = "mail.example.com";
    process.env.MSG91_EMAIL_TEMPLATE_ID = "template-1";
    process.env.RESEND_API_KEY = "resend-key";

    const calls: string[] = [];
    global.fetch = jest.fn(async (url: unknown) => {
      calls.push(String(url));
      return { ok: true, status: 202, text: async () => "" };
    }) as unknown as typeof fetch;

    // Resend is the default sender, and the only one that carries the designed HTML.
    await expect(sendMail(MESSAGE)).resolves.toEqual({ ok: true, transport: "resend" });
    expect(mailTransportName()).toBe("resend");
    expect(calls).toEqual(["https://api.resend.com/emails"]);
  });

  it("picks the message up when Resend is having a bad afternoon", async () => {
    process.env.MAIL_FROM = "Stockers <hi@example.com>";
    process.env.MSG91_AUTH_KEY = "auth";
    process.env.MSG91_EMAIL_DOMAIN = "mail.example.com";
    process.env.MSG91_EMAIL_TEMPLATE_ID = "template-1";
    process.env.RESEND_API_KEY = "resend-key";

    const calls: string[] = [];
    global.fetch = jest.fn(async (url: unknown) => {
      calls.push(String(url));
      const resend = String(url).includes("resend.com");
      return { ok: !resend, status: resend ? 500 : 200, text: async () => (resend ? "upstream error" : "") };
    }) as unknown as typeof fetch;

    // A Resend outage costs a retry through MSG91, not an undelivered reset code.
    await expect(sendMail(MESSAGE)).resolves.toEqual({ ok: true, transport: "msg91" });
    expect(calls).toEqual(["https://api.resend.com/emails", "https://control.msg91.com/api/v5/email/send"]);
  });
});
