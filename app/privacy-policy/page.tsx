import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "../components/json-ld";
import { PolicyCallout, PolicyList, PolicyPage, PolicySection, PolicyTable } from "../components/policy-page";
import { ACCOUNT_FIELDS, CLIENT_STORAGE, COMPANY, CONTACT, DATA_SOURCES, POLICY_UPDATED, PROCESSORS } from "../lib/policy";
import { breadcrumbSchema, graph, pageMetadata, webPageSchema } from "../lib/seo";

const PRIVACY_DESCRIPTION =
  "Exactly what StockersAI stores about you, what your browser keeps, who else sees it, how long it is held, and how to have it deleted.";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description: PRIVACY_DESCRIPTION,
  path: "/privacy-policy",
  keywords: ["StockersAI privacy policy", "StockersAI data deletion", "StockersAI account data"],
});

export default function PrivacyPolicyPage() {
  return (
    <>
      <JsonLd
        schema={graph(
          webPageSchema({
            name: "Privacy Policy",
            description: PRIVACY_DESCRIPTION,
            path: "/privacy-policy",
            breadcrumb: breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Privacy Policy", path: "/privacy-policy" },
            ]),
          }),
        )}
      />
    <PolicyPage
      eyebrow="Legal"
      title="Privacy Policy"
      summary="This page lists every piece of information the service holds about you, by name — not a summary of categories. If something is not on this page, we do not collect it."
      updated={POLICY_UPDATED.privacy}
    >
      <PolicyCallout>
        We do not sell your data, we do not share it with advertisers, and there are no third-party analytics or
        advertising trackers on this site. Nothing below is a preamble to an exception.
      </PolicyCallout>

      <PolicySection title="What the account holds">
        <p>Creating an account stores exactly this, and nothing else:</p>
        <PolicyList items={ACCOUNT_FIELDS} />
        <p>
          We do not ask for your date of birth, your PAN, your demat details, your portfolio or your phone number, and
          there is nowhere in the product to enter them. We do not store card numbers or UPI identifiers — see{" "}
          <em>Payments</em> below.
        </p>
      </PolicySection>

      <PolicySection title="What your browser keeps">
        <p>
          Some of the product runs entirely on your own device. The items marked as never leaving your browser are exactly
          that: they are not copied to our servers, so we cannot read them and cannot restore them if you clear your
          browser.
        </p>
        <PolicyTable
          head={["Name", "Where", "What it is for"]}
          rows={CLIENT_STORAGE.map((item) => [item.key, item.kind, item.purpose])}
        />
        <p>
          The one cookie we set is the session cookie, and it exists so the server can tell it is you. It is not used for
          tracking, and there are no cookies from anyone else. Because we set no advertising or analytics cookies, there
          is no consent banner to click through.
        </p>
      </PolicySection>

      <PolicySection title="Payments">
        <p>
          Card, UPI and netbanking details are entered on Razorpay&apos;s own checkout, hosted by Razorpay. Those details
          never reach our servers and we could not store them if we wanted to. What we receive back is a payment
          identifier, the amount, and whether it succeeded — that is what the account record&apos;s last payment field
          holds.
        </p>
        <p>Razorpay handles that data under its own privacy policy, as the payment processor.</p>
      </PolicySection>

      <PolicySection title="Who else sees anything">
        <p>Three services process data on our behalf. Each is named, along with precisely what reaches it.</p>
        <PolicyTable
          head={["Service", "Role", "What it receives"]}
          rows={PROCESSORS.map((processor) => [processor.name, processor.role, processor.data])}
        />
        <p>
          The AI row is worth reading twice. When a board asks the model to write a summary, what is sent is the figures
          already on your screen and the question being asked — never your name, your email, your account identifier or
          anything about who is looking. The model is given numbers and asked to describe them.
        </p>
      </PolicySection>

      <PolicySection title="Where the market data comes from">
        <p>
          Market data flows the other way: we fetch it, and these sources learn nothing about you. Requests to them are
          made by our servers, not by your browser, so your IP address is not exposed to them.
        </p>
        <PolicyTable head={["Source", "What we take from it"]} rows={DATA_SOURCES.map((source) => [source.name, source.used])} />
        <p>
          Company logos are the exception: those images load directly in your browser from a logo host, which means that
          host sees your IP address as it would for any image on any website. No identifying information is attached to
          those requests.
        </p>
      </PolicySection>

      <PolicySection title="How long it is kept">
        <PolicyList
          items={[
            "Your account record is kept while the account exists, and deleted when you ask us to delete it.",
            "Payment identifiers are kept for as long as tax and accounting rules require us to be able to evidence a transaction, which is longer than the account itself may last.",
            "Email verification tokens are single-use and are cleared the moment they are spent.",
            "Anything stored in your browser is kept until you clear it. We have no copy and no way to expire it for you.",
          ]}
        />
      </PolicySection>

      <PolicySection title="How it is protected">
        <PolicyList
          items={[
            "Passwords are hashed with scrypt and a per-account random salt. We cannot read your password, and a stolen database would not reveal it.",
            "Session tokens are signed, so one cannot be forged from an account id, and are compared in constant time.",
            "Administrative access is checked on the server for every request, not merely hidden in the interface.",
          ]}
        />
        <p>
          No system is perfectly secure. If we discover a breach affecting your data we will tell you and the relevant
          authority, and we will tell you what was exposed rather than that &ldquo;an incident occurred&rdquo;.
        </p>
      </PolicySection>

      <PolicySection title="Your rights">
        <p>
          Write to{" "}
          <a href={`mailto:${CONTACT.privacy}`} className="font-semibold text-emerald-600 underline underline-offset-2 dark:text-emerald-400">
            {CONTACT.privacy}
          </a>{" "}
          from the address on the account and we will act on any of these:
        </p>
        <PolicyList
          items={[
            "A copy of everything we hold about you, in a readable format.",
            "Correction of anything inaccurate — your name or email address, for instance.",
            "Deletion of your account and its record. We will tell you what, if anything, we must keep for tax purposes and why.",
            "Withdrawal of consent, which in practice means closing the account, since the only data we hold is what the account needs to work.",
          ]}
        />
        <p>
          We respond within {CONTACT.grievanceResolutionDays} days. These rights sit alongside the Digital Personal Data
          Protection Act, 2023 and do not replace anything it gives you.
        </p>
      </PolicySection>

      <PolicySection title="Children">
        <p>
          The service is not intended for anyone under 18, and we do not knowingly hold data about a child. If you believe
          we do, write to {CONTACT.privacy} and we will delete it.
        </p>
      </PolicySection>

      <PolicySection title="Changes, and how to complain">
        <p>
          If this policy changes in a way that affects what we collect or who sees it, we will say so on this page and
          update the date at the top. Continuing to use the service after that means accepting the revised policy.
        </p>
        <p>
          Complaints go to our grievance officer, {CONTACT.grievanceOfficer}, at{" "}
          <a href={`mailto:${CONTACT.grievanceEmail}`} className="font-semibold text-emerald-600 underline underline-offset-2 dark:text-emerald-400">
            {CONTACT.grievanceEmail}
          </a>
          , acknowledged within {CONTACT.grievanceAcknowledgementDays} working days. What the service does and does not
          claim about markets is set out in the{" "}
          <Link href="/disclaimer" className="font-semibold text-emerald-600 underline underline-offset-2 dark:text-emerald-400">
            Disclaimer
          </Link>
          .
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          {COMPANY.legalName}, {COMPANY.address}. {COMPANY.registration}.
        </p>
      </PolicySection>
      </PolicyPage>
    </>
  );
}
