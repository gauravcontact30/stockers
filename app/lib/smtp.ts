import "server-only";

// A small SMTP client, so that "free" can mean an account the operator already has.
//
// Every hosted mail API — Resend, Brevo, SendGrid — is free at the volume this app sends and all
// of them need one thing: an account and an API key. SMTP needs an account too, but it is very
// likely to be one the operator already owns: a Gmail address with an app password, or the mailbox
// that came with their domain. That is the gap this fills, and it is the reason this is hand-rolled
// against `node:tls` rather than pulled in as a dependency — nodemailer is ~1MB of features for the
// ~120 lines below.
//
// Deliberately minimal, and honest about it: implicit TLS only (port 465, the default for
// submission over TLS), AUTH LOGIN only, one recipient, no attachments, no connection pooling and
// no retries. That is the whole of what this app asks of a mail server. STARTTLS on port 587 is
// *not* supported — negotiating an upgrade from a plaintext socket is where a hand-rolled client
// gets dangerous, so the safe port is the only one offered.

import { connect, type TLSSocket } from "node:tls";

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
};

export type SmtpEnvelope = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

/** Nothing waits on a mail server longer than this, at any single step or overall. */
const SMTP_TIMEOUT_MS = 15_000;

export function smtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  if (!host || !user || !password) return null;

  return { host, port: Number(process.env.SMTP_PORT) || 465, user, password };
}

/** RFC 5322 headers are a single line each; a newline in one is a header-injection attempt. */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Encodes a subject that is not plain ASCII.
 *
 * A raw non-ASCII byte in a header is undefined behaviour at the far end — some servers pass it,
 * some mangle it, some reject the message. Base64 in an encoded-word is what the standard asks for
 * and every client understands.
 */
function encodeSubject(subject: string): string {
  const clean = headerSafe(subject);
  if (!/[^ -~]/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

/**
 * A line beginning with a period ends the DATA block, so one in the body must be doubled.
 *
 * Without this, a message whose text happens to wrap onto a line starting with "." is delivered
 * truncated at that point — the classic SMTP bug, and silent when it happens.
 */
function dotStuff(body: string): string {
  return body.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function boundary(): string {
  return `--stockers-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The message as it goes on the wire: a plain-text part and an HTML part, for any client. */
export function buildMimeMessage(envelope: SmtpEnvelope, mark = boundary()): string {
  return [
    `From: ${headerSafe(envelope.from)}`,
    `To: ${headerSafe(envelope.to)}`,
    `Subject: ${encodeSubject(envelope.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${mark}"`,
    "",
    `--${mark}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    dotStuff(envelope.text),
    "",
    `--${mark}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    dotStuff(envelope.html),
    "",
    `--${mark}--`,
    "",
  ].join("\r\n");
}

/** The three-digit status a server answers with. 2xx and 3xx are "carry on". */
function statusOf(reply: string): number {
  return Number(reply.slice(0, 3));
}

type Conversation = {
  /** Sends one command and resolves with the server's reply, rejecting on an error status. */
  say: (command: string, expected: number[]) => Promise<string>;
  end: () => void;
};

/**
 * Wraps the socket as a request/reply conversation.
 *
 * SMTP is strictly lockstep — one command, one reply — so the whole protocol below reads as a list
 * of `await say(...)` lines rather than as a state machine over data events.
 */
function converse(socket: TLSSocket): Conversation {
  let buffer = "";
  let waiting: { resolve: (reply: string) => void; reject: (error: Error) => void; expected: number[] } | null = null;

  const settle = () => {
    if (!waiting) return;
    // A multi-line reply repeats the code with a hyphen on every line but the last.
    const match = /^(\d{3})(?: [^\n]*)?\r?\n$|(?:^|\n)(\d{3}) [^\n]*\r?\n$/.exec(buffer);
    if (!match) return;

    const reply = buffer;
    const code = statusOf(reply.slice(reply.lastIndexOf("\n", reply.length - 3) + 1));
    const { resolve, reject, expected } = waiting;
    waiting = null;
    buffer = "";

    if (expected.includes(code)) resolve(reply);
    else reject(new Error(`SMTP server said: ${reply.trim().slice(0, 200)}`));
  };

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    settle();
  });

  const fail = (error: Error) => {
    const pending = waiting;
    waiting = null;
    pending?.reject(error);
  };

  socket.on("error", fail);
  socket.on("close", () => fail(new Error("SMTP connection closed early.")));

  return {
    say(command, expected) {
      return new Promise<string>((resolve, reject) => {
        waiting = { resolve, reject, expected };
        if (command) socket.write(`${command}\r\n`);
        settle();
      });
    },
    end() {
      socket.destroy();
    },
  };
}

/**
 * Delivers one message over SMTP. Resolves with an error string rather than throwing.
 *
 * The greeting is read before anything is sent, which is what makes the first `say("")` below not
 * a mistake: the server speaks first on SMTP, and skipping that reply desynchronises every
 * exchange after it.
 */
export async function sendSmtpMail(config: SmtpConfig, envelope: SmtpEnvelope): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      socket.destroy();
      finish({ ok: false, error: "SMTP server did not answer in time." });
    }, SMTP_TIMEOUT_MS);

    const socket = connect({ host: config.host, port: config.port, servername: config.host });

    socket.once("secureConnect", () => {
      const { say, end } = converse(socket);

      void (async () => {
        try {
          await say("", [220]);
          await say(`EHLO ${config.host}`, [250]);
          await say("AUTH LOGIN", [334]);
          await say(Buffer.from(config.user, "utf8").toString("base64"), [334]);
          await say(Buffer.from(config.password, "utf8").toString("base64"), [235]);
          await say(`MAIL FROM:<${headerSafe(config.user)}>`, [250]);
          await say(`RCPT TO:<${headerSafe(envelope.to)}>`, [250, 251]);
          await say("DATA", [354]);
          await say(`${buildMimeMessage(envelope)}.`, [250]);
          await say("QUIT", [221]).catch(() => "");
          end();
          finish({ ok: true });
        } catch (error) {
          end();
          finish({ ok: false, error: String(error).slice(0, 200) });
        }
      })();
    });

    socket.once("error", (error) => finish({ ok: false, error: String(error).slice(0, 200) }));
  });
}
