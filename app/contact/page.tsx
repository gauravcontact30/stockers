import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeader } from "../components/auth-header";
import { BackToTop } from "../components/back-to-top";
import { ContactForm } from "../components/contact-form";
import { SiteFooter } from "../components/site-footer";
import { COMPANY, CONTACT } from "../lib/policy";

export const metadata: Metadata = {
  title: "Contact Us · Stockers.AI",
  description:
    "Reach the Stockers.AI desk: support, billing, privacy requests and complaints, with the addresses and response times for each.",
};

/** Who to write to, and what to expect back. Stated per route so nobody waits on the wrong inbox. */
const CHANNELS: { title: string; email: string; blurb: string; response: string }[] = [
  {
    title: "Support",
    email: CONTACT.support,
    blurb: "Anything about using the product, a figure that looks wrong, or an account you cannot get into.",
    response: "Usually within 2 working days",
  },
  {
    title: "Billing, refunds and cancellations",
    email: CONTACT.support,
    blurb: "Include the payment id from your Razorpay receipt and we can find the charge immediately.",
    response: `Acknowledged within ${CONTACT.grievanceAcknowledgementDays} working days`,
  },
  {
    title: "Privacy and data requests",
    email: CONTACT.privacy,
    blurb: "A copy of your data, a correction, or deletion of your account and its record.",
    response: `Answered within ${CONTACT.grievanceResolutionDays} days`,
  },
  {
    title: "Grievance officer",
    email: CONTACT.grievanceEmail,
    blurb: `${CONTACT.grievanceOfficer} handles complaints that support has not resolved to your satisfaction.`,
    response: `Acknowledged within ${CONTACT.grievanceAcknowledgementDays} working days, resolved within ${CONTACT.grievanceResolutionDays}`,
  },
];

export default function ContactPage() {
  return (
    <main className="gutter min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 py-6 text-slate-700 transition-colors dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <AuthHeader />

        <header className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400">Contact us</p>
          <h1 className="text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl dark:text-white">
            Every message here reaches a person
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            There is no ticket maze and no chatbot in front of us. Write below or email the right desk directly — both
            arrive in the same place.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Send us a message</h2>
            <ContactForm />
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Or write directly</h2>
            <ul className="space-y-3">
              {CHANNELS.map((channel) => (
                <li key={channel.title} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{channel.title}</p>
                  <a
                    href={`mailto:${channel.email}`}
                    className="mt-0.5 inline-block text-sm font-medium text-emerald-600 underline underline-offset-2 dark:text-emerald-400"
                  >
                    {channel.email}
                  </a>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{channel.blurb}</p>
                  <p className="mt-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">{channel.response}</p>
                </li>
              ))}
            </ul>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Registered address</p>
              <address className="mt-1.5 text-xs not-italic leading-relaxed text-slate-600 dark:text-slate-400">
                {COMPANY.legalName}
                <br />
                {COMPANY.address}
                <br />
                {COMPANY.registration}
              </address>
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
          <h2 className="text-base font-semibold text-amber-900 dark:text-amber-200">Before you write about a stock</h2>
          <p className="mt-2 text-sm leading-relaxed text-amber-900/90 dark:text-amber-200/90">
            We cannot tell you what to buy or sell, or whether a security suits you. {COMPANY.brand} is not a
            SEBI-registered investment adviser, and answering that question would be exactly what registration exists to
            govern. We can happily explain how a figure was calculated or where it came from — see the{" "}
            <Link href="/disclaimer" className="font-semibold underline underline-offset-2">
              Disclaimer
            </Link>
            .
          </p>
        </section>

        <SiteFooter />
      </div>

      <BackToTop />
    </main>
  );
}
