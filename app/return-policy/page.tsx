import type { Metadata } from "next";
import Link from "next/link";
import { PolicyCallout, PolicyList, PolicyPage, PolicySection } from "../components/policy-page";
import { COMPANY, CONTACT, POLICY_UPDATED, TERMS } from "../lib/policy";

export const metadata: Metadata = {
  title: "Return Policy · StockersAI",
  description:
    "StockersAI sells a digital subscription, so there is nothing to ship back. This page explains what takes the place of a return, and how to end a subscription.",
};

export default function ReturnPolicyPage() {
  return (
    <PolicyPage
      eyebrow="Legal"
      title="Return Policy"
      summary="StockersAI sells access to a research tool. Nothing is shipped, so nothing can be sent back — what would be a return for a physical product is a refund here. This page says plainly what that means and where the equivalent rights live."
      updated={POLICY_UPDATED.returns}
    >
      <PolicyCallout>
        There are no physical goods, no delivery and no shipping charges. If you want your money back, you are looking
        for the{" "}
        <Link href="/refund-policy" className="font-semibold underline underline-offset-2">
          Refund Policy
        </Link>
        .
      </PolicyCallout>

      <PolicySection title="Why this page says so little">
        <p>
          A return policy exists so a buyer knows how to send something back and get their money returned. {COMPANY.brand}{" "}
          is a subscription to a website: there is no parcel, no courier and no packaging, and access is granted the
          instant a payment is captured rather than being dispatched to an address.
        </p>
        <p>
          Rather than dress that up as a returns process with invented timelines for goods that do not exist, this page
          states the position and points you at the rights that actually apply. Those rights are not smaller for being
          described elsewhere.
        </p>
      </PolicySection>

      <PolicySection title="What takes the place of a return">
        <PolicyList
          items={[
            <>
              <strong>Changed your mind?</strong> A full refund is available for {TERMS.coolingOffDays} days after any
              charge, for any reason or none. See the{" "}
              <Link href="/refund-policy" className="font-semibold text-emerald-600 underline underline-offset-2 dark:text-emerald-400">
                Refund Policy
              </Link>
              .
            </>,
            <>
              <strong>Want to stop paying?</strong> Cancel at any time. You keep the access you already paid for until
              that period runs out — {TERMS.monthlyDays} days on a monthly plan, {TERMS.yearlyDays} on an annual one — and
              you are not charged again.
            </>,
            <>
              <strong>Charged in error?</strong> A duplicate charge, a charge after cancelling, or a payment that never
              unlocked your account is refunded in full whenever it comes to light. There is no time limit on those.
            </>,
            <>
              <strong>Not sure yet?</strong> Do not pay at all. Every account gets {TERMS.trialDays} calendar days of
              Starter and Pro AI access without a card.
            </>,
          ]}
        />
      </PolicySection>

      <PolicySection title="Cancelling a subscription">
        <p>
          Write to{" "}
          <a href={`mailto:${CONTACT.support}`} className="font-semibold text-emerald-600 underline underline-offset-2 dark:text-emerald-400">
            {CONTACT.support}
          </a>{" "}
          from the address on the account. We confirm the cancellation and tell you the date your access runs to. There is
          no cancellation fee and no notice period.
        </p>
        <p>
          Cancelling stops future charges. It is not the same as asking for a refund of a charge already taken — if you
          want that too, say so, and we will apply the{" "}
          <Link href="/refund-policy" className="font-semibold text-emerald-600 underline underline-offset-2 dark:text-emerald-400">
            Refund Policy
          </Link>{" "}
          to it.
        </p>
      </PolicySection>

      <PolicySection title="Your data when you leave">
        <p>
          Ending a subscription does not delete your account. If you want it removed as well, ask — the{" "}
          <Link href="/privacy-policy" className="font-semibold text-emerald-600 underline underline-offset-2 dark:text-emerald-400">
            Privacy Policy
          </Link>{" "}
          sets out what we hold, what we delete and what we are obliged to keep. Your watchlist and saved research live in
          your own browser, so clearing its storage removes those immediately and without asking us.
        </p>
      </PolicySection>

      <PolicySection title="Contact">
        <p>
          {CONTACT.grievanceOfficer} handles complaints at{" "}
          <a href={`mailto:${CONTACT.grievanceEmail}`} className="font-semibold text-emerald-600 underline underline-offset-2 dark:text-emerald-400">
            {CONTACT.grievanceEmail}
          </a>
          , acknowledged within {CONTACT.grievanceAcknowledgementDays} working days and resolved within{" "}
          {CONTACT.grievanceResolutionDays} days.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          {COMPANY.legalName}, {COMPANY.address}.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
