/** @jest-environment node */

// The parts of the SMTP client that can be checked without a mail server: the configuration it
// reads, and the bytes it would put on the wire. The socket conversation itself is exercised by
// pointing SMTP_* at a real server, which a unit test cannot do.

import { buildMimeMessage, smtpConfig } from "../../app/lib/smtp";

const KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("smtpConfig", () => {
  it("needs a host, a user and a password, and defaults to the implicit-TLS port", () => {
    expect(smtpConfig()).toBeNull();

    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_USER = "you@gmail.com";
    expect(smtpConfig()).toBeNull();

    process.env.SMTP_PASSWORD = "app password";
    expect(smtpConfig()).toEqual({ host: "smtp.gmail.com", port: 465, user: "you@gmail.com", password: "app password" });

    process.env.SMTP_PORT = "2465";
    expect(smtpConfig()?.port).toBe(2465);
  });
});

describe("buildMimeMessage", () => {
  const envelope = {
    from: "StockersAI <hi@example.com>",
    to: "reader@example.com",
    subject: "Your code",
    html: "<p>123456</p>",
    text: "123456",
  };

  it("writes both alternatives with CRLF line endings", () => {
    const message = buildMimeMessage(envelope, "BOUNDARY");

    expect(message).toContain("From: StockersAI <hi@example.com>\r\n");
    expect(message).toContain("To: reader@example.com\r\n");
    expect(message).toContain('Content-Type: multipart/alternative; boundary="BOUNDARY"');
    expect(message).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(message).toContain("Content-Type: text/html; charset=UTF-8");
    expect(message.trimEnd().endsWith("--BOUNDARY--")).toBe(true);
    expect(message).not.toMatch(/[^\r]\n/);
  });

  it("encodes a subject that is not plain ASCII, rather than putting raw bytes in a header", () => {
    const message = buildMimeMessage({ ...envelope, subject: "Your code — 123456" }, "B");

    expect(message).toContain("Subject: =?UTF-8?B?");
    expect(message).not.toContain("Subject: Your code — 123456");
  });

  it("refuses to let a header carry a newline, which is how a header is injected", () => {
    const message = buildMimeMessage({ ...envelope, to: "reader@example.com\r\nBcc: victim@example.com" }, "B");

    // Flattened onto the To line rather than becoming a header of its own.
    expect(message).not.toContain("\r\nBcc:");
    expect(message).toContain("To: reader@example.com Bcc: victim@example.com\r\n");
  });

  it("doubles a leading period, which would otherwise end the message early", () => {
    const message = buildMimeMessage({ ...envelope, text: "line one\n.hidden\nline three" }, "B");

    expect(message).toContain("line one\r\n..hidden\r\nline three");
  });
});
