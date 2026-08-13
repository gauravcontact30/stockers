"use client";

import { useState } from "react";
import { LIMITS, TOPICS, type Topic } from "../lib/contact";
import { track } from "../lib/track";

/**
 * The contact form.
 *
 * It posts to a real endpoint that really sends the mail — the alternative, a form that looks like
 * it works and quietly does nothing, is worse than printing an email address and no form at all.
 *
 * Every state it can be in is distinct on screen: the field the visitor got wrong is named, a send
 * in flight disables the button rather than accepting a second click, and a success message says
 * what happens next instead of only that something happened.
 */

const FIELD =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white";

export function ContactForm() {
  const [topic, setTopic] = useState<Topic>("Support");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  // The honeypot. Hidden from people, filled in by bots; its value is only ever read by the server.
  const [company, setCompany] = useState("");

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, topic, message, company }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data?.error || "That didn't go through.");
      // The topic, never the message: what people write here is theirs, and the admin dashboard
      // only needs to know which kind of enquiry is arriving.
      track("contact.submit", topic);
      setSent(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That didn't go through.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <p className="text-base font-semibold text-emerald-800 dark:text-emerald-300">Thanks — that reached us.</p>
        <p className="mt-2 text-sm leading-relaxed text-emerald-900/80 dark:text-emerald-200/80">
          We reply to {topic.toLowerCase()} enquiries from a real person, usually within two working days. We&apos;ll
          write to {email}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Your name</span>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={LIMITS.name}
            autoComplete="name"
            className={`mt-1.5 ${FIELD}`}
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Your email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={LIMITS.email}
            autoComplete="email"
            className={`mt-1.5 ${FIELD}`}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">What is it about?</span>
        <select value={topic} onChange={(event) => setTopic(event.target.value as Topic)} className={`mt-1.5 ${FIELD}`}>
          {TOPICS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Your message</span>
        <textarea
          required
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={6}
          maxLength={LIMITS.message}
          placeholder="The more specific you are, the faster we can help. If it's about a payment, include the payment id from your receipt."
          className={`mt-1.5 ${FIELD} resize-y`}
        />
      </label>

      {/* Hidden from people and from screen readers; a bot filling in every field trips it. */}
      <div aria-hidden="true" className="hidden">
        <label>
          Company
          <input tabIndex={-1} autoComplete="off" value={company} onChange={(event) => setCompany(event.target.value)} />
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="w-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:from-emerald-500 hover:to-teal-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {sending ? "Sending…" : "Send message"}
      </button>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        We use your address to reply and nothing else. It is not added to any mailing list.
      </p>
    </form>
  );
}
