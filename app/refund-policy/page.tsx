import type { Metadata } from "next";
import Link from "next/link";
import { PolicyCallout, PolicyList, PolicyPage, PolicySection } from "../components/policy-page";
import { COMPANY, CONTACT, POLICY_UPDATED, TERMS } from "../lib/policy";

export const metadata: Metadata = {
  title: "Refund Policy · StockersAI",
  description:
    "When a StockersAI subscription can be refunded, how much, how to ask, and how long it takes to reach your account.",
};

export default function RefundPolicyPage() {
  return (
    <PolicyPage
      eyebrow="Legal"
      title="Refund Policy"
      summary="StockersAI is a subscription to a research tool. This page says exactly when your money comes back, how much of it, and how long that takes — including the cases where it does not."
      updated={POLICY_UPDATED.refunds}
    >
      <PolicyCallout>
        Try before you pay. Every account gets {TERMS.trialDays} calendar days of Starter and Pro AI access with no card
        required, so you can decide whether the product is worth paying for before any money changes hands.
      </PolicyCallout>

      <PolicySection title="The short version">
        <PolicyList
          items={[
            <>
              <strong>Within {TERMS.coolingOffDays} days of a charge:</strong> a full refund, for any reason or none. Just
              ask.
            </>,
            <>
              <strong>After {TERMS.coolingOffDays} days on an annual plan:</strong> a pro-rata refund of the whole months
              you have not used.
            </>,
            <>
              <strong>After {TERMS.coolingOffDays} days on a monthly plan:</strong> no refund for the current month, but
              you can cancel so you are not charged again.
            </>,
            <>
              <strong>If we broke it:</strong> a full refund regardless of how long you have had the subscription. See{" "}
              <em>When we refund without being asked</em> below.
            </>,
          ]}
        />
      </PolicySection>

      <PolicySection title="The cooling-off period">
        <p>
          For {TERMS.coolingOffDays} days after any successful charge — a first subscription, a renewal or an upgrade — you
          can ask for a full refund and we will process it without asking you to justify it. This applies whether or not
          you have used the product in the meantime.
        </p>
        <p>
          The {TERMS.coolingOffDays} days run from the moment the payment is captured, which is the date on your Razorpay
          receipt, not from the day you got round to signing in.
        </p>
      </PolicySection>

      <PolicySection title="After the cooling-off period">
        <p>
          A monthly subscription buys {TERMS.monthlyDays} days and an annual one buys {TERMS.yearlyDays} days. Once the
          cooling-off period has passed, what happens depends on which you bought.
        </p>
        <PolicyList
          items={[
            <>
              <strong>Annual plans</strong> are refunded pro rata. We count the whole calendar months remaining on the
              subscription, divide the amount you actually paid by twelve, and refund that many twelfths. Part-months are
              not refunded. Because the annual price is already discounted against the monthly one, the refund is
              calculated from what you paid, not from the higher monthly rate.
            </>,
            <>
              <strong>Monthly plans</strong> are not refunded for the period already running, because that period is
              nearly over by definition. You can cancel at any time and keep your access until the {TERMS.monthlyDays}{" "}
              days you paid for run out; you simply will not be charged again.
            </>,
          ]}
        />
      </PolicySection>

      <PolicySection title="When we refund without being asked">
        <p>These are our failures, not your change of mind, and the cooling-off period does not apply to them.</p>
        <PolicyList
          items={[
            "You were charged twice for the same subscription period. We refund the duplicate in full.",
            "You were charged after cancelling. We refund it in full.",
            "A payment succeeded at Razorpay but never unlocked your account, and we could not put that right. We refund it in full.",
            <>
              The paid features were substantially unavailable for a continuous period, through our fault rather than an
              exchange holiday or an outage at a data source we depend on. We refund the affected period pro rata. What we
              depend on is listed in the <Link href="/disclaimer" className="font-semibold text-emerald-600 underline underline-offset-2 dark:text-emerald-400">Disclaimer</Link>.
            </>,
          ]}
        />
      </PolicySection>

      <PolicySection title="What is not refundable">
        <p>
          We will not refund a subscription because the research disagreed with what the market did. Nothing on this
          platform is a promise about a price, and a stock going the other way is not a defect in the product — it is the
          market. This is set out at more length in the{" "}
          <Link href="/disclaimer" className="font-semibold text-emerald-600 underline underline-offset-2 dark:text-emerald-400">
            Disclaimer
          </Link>
          , and it is the single most important thing to have understood before subscribing.
        </p>
        <p>
          We also will not refund an account that was suspended for sharing credentials, scraping the service, or
          reselling its output.
        </p>
      </PolicySection>

      <PolicySection title="How to ask, and how long it takes">
        <PolicyList
          items={[
            <>
              Write to{" "}
              <a href={`mailto:${CONTACT.support}`} className="font-semibold text-emerald-600 underline underline-offset-2 dark:text-emerald-400">
                {CONTACT.support}
              </a>{" "}
              from the email address on the account, with the Razorpay payment id from your receipt.
            </>,
            <>We acknowledge within {CONTACT.grievanceAcknowledgementDays} working days and tell you the amount and the reason for it.</>,
            "Approved refunds are issued to the original payment method through Razorpay. We cannot send a refund anywhere else — not to a different card, a different UPI id or a bank transfer.",
            "Razorpay typically settles a refund back to your bank in 5 to 7 working days once we release it. That leg is your bank's timetable, not ours.",
          ]}
        />
        <p>
          Your access ends when the refund is issued, not when it lands in your account. A pro-rata refund ends access
          immediately for the period being refunded.
        </p>
      </PolicySection>

      <PolicySection title="If you are not satisfied with the outcome">
        <p>
          Escalate to our grievance officer, {CONTACT.grievanceOfficer}, at{" "}
          <a href={`mailto:${CONTACT.grievanceEmail}`} className="font-semibold text-emerald-600 underline underline-offset-2 dark:text-emerald-400">
            {CONTACT.grievanceEmail}
          </a>
          . Complaints are acknowledged within {CONTACT.grievanceAcknowledgementDays} working days and resolved within{" "}
          {CONTACT.grievanceResolutionDays} days. This does not affect any right you have under the Consumer Protection
          Act, 2019.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          {COMPANY.legalName}, {COMPANY.address}.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
