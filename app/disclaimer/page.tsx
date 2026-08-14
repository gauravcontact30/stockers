import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "../components/json-ld";
import { PolicyCallout, PolicyList, PolicyPage, PolicySection, PolicyTable } from "../components/policy-page";
import { COMPANY, CONTACT, DATA_SOURCES, POLICY_UPDATED } from "../lib/policy";
import { breadcrumbSchema, graph, pageMetadata, webPageSchema } from "../lib/seo";

const DISCLAIMER_DESCRIPTION =
  "StockersAI is a research tool, not an investment adviser. What the figures are, where they come from, what the AI does and does not do, and what none of it promises.";

export const metadata: Metadata = pageMetadata({
  title: "Disclaimer",
  description: DISCLAIMER_DESCRIPTION,
  path: "/disclaimer",
  keywords: ["StockersAI disclaimer", "not investment advice", "SEBI investment adviser disclaimer"],
});

export default function DisclaimerPage() {
  return (
    <>
      <JsonLd
        schema={graph(
          webPageSchema({
            name: "Disclaimer",
            description: DISCLAIMER_DESCRIPTION,
            path: "/disclaimer",
            breadcrumb: breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Disclaimer", path: "/disclaimer" },
            ]),
          }),
        )}
      />
    <PolicyPage
      eyebrow="Legal"
      title="Disclaimer"
      summary="This page is the one to read before you act on anything here. It says what this service is, what it is not, and where its numbers stop being reliable."
      updated={POLICY_UPDATED.disclaimer}
    >
      <PolicyCallout tone="rose">
        <strong>{COMPANY.brand} is not a SEBI-registered investment adviser or research analyst.</strong> Nothing on this
        platform is investment advice, a recommendation, or an offer to outperform or underperform any security. It is research material
        for your own decision-making, and you remain solely responsible for what you do with it.
      </PolicyCallout>

      <PolicySection title="What this service is">
        <p>
          {COMPANY.brand} reads publicly published exchange data, measures it, and describes what it measured. A board
          ranking the year&apos;s gainers is arithmetic over BSE&apos;s own published closes. A stance of &ldquo;outperform&rdquo;
          or &ldquo;underperform&rdquo; is a label attached to a score computed from those returns.
        </p>
        <p>
          It is a tool for looking at the market quickly. It is not a person who knows your circumstances, and it has no
          view on whether a security suits you.
        </p>
      </PolicySection>

      <PolicySection title="What it is not">
        <PolicyList
          items={[
            <>
              <strong>Not registered advice.</strong> We hold no SEBI registration as an investment adviser (under the
              SEBI (Investment Advisers) Regulations, 2013) or as a research analyst (under the SEBI (Research Analysts)
              Regulations, 2014). Nothing here should be treated as a research report within the meaning of those rules.
            </>,
            <>
              <strong>Not personalised.</strong> We do not know your income, your tax position, your existing holdings,
              your liabilities or your risk appetite, and nothing on the platform is tailored to them.
            </>,
            <>
              <strong>Not a broker.</strong> We do not execute trades, hold securities or handle client funds. We have no
              custody of anything you own.
            </>,
            <>
              <strong>Not a tip service.</strong> We do not take payment to feature a company, and no company pays to
              appear on any board. What appears is whatever the ranking produced.
            </>,
          ]}
        />
      </PolicySection>

      <PolicySection title="Where the numbers come from, and their limits">
        <p>
          Every figure is sourced from a public feed published by the exchange or a market data provider. None of these
          feeds is a licensed, warranted data product, and none of the organisations below has endorsed this service or
          checked it.
        </p>
        <PolicyTable head={["Source", "What we take from it"]} rows={DATA_SOURCES.map((source) => [source.name, source.used])} />
        <PolicyList
          items={[
            "Figures are as published by the source and may be delayed, revised or wrong at the source. We do not independently verify them.",
            "A feed that is unreachable leaves a board blank or a value dashed. We show a gap rather than filling it with an estimate — a dash means we do not know, and should be read that way.",
            "Cached figures are served while they are refreshed, so a number may be a few minutes old. Boards state the session or the moment they were measured; trust that stamp over the freshness you assume.",
            "Prices are for the exchange named on the board. A company listed on both BSE and NSE may print different figures on each.",
          ]}
        />
      </PolicySection>

      <PolicySection title="What the AI does, and what it is not allowed to do">
        <p>
          The written commentary on this platform is generated by a language model. It is given figures that have already
          been measured and asked to explain them. It is instructed not to invent a number, a company or a direction of
          travel, and the stance a board shows is computed by arithmetic before the model is called — the model explains
          the score, it does not choose it.
        </p>
        <p>
          That constrains the model but does not make it infallible. Language models can misread a figure, phrase
          something misleadingly, or write with more confidence than the underlying data supports. Where a summary and the
          numbers beside it disagree, the numbers are what happened.
        </p>
        <p>
          Where no AI key is configured, summaries are composed from the figures directly and the panel says so. Panels
          label their own provenance; that label is accurate and worth reading.
        </p>
      </PolicySection>

      <PolicySection title="Past performance">
        <p>
          Many boards rank by past return — one year, three years, five years. Past performance is not a guide to future
          performance and is not intended to suggest one. A company that has compounded for five years can fall the day
          after you read about it.
        </p>
        <p>
          Screens that combine a strong past return with a current discount are describing two facts about the past and
          the present. Neither is a forecast, and the combination is not one either.
        </p>
      </PolicySection>

      <PolicySection title="Market risk">
        <p>
          Investments in securities are subject to market risk. You can lose money, including your entire capital. Read
          all scheme and offer documents carefully before investing, and consider taking advice from a SEBI-registered
          investment adviser who can account for your particular circumstances.
        </p>
      </PolicySection>

      <PolicySection title="Availability">
        <p>
          The service depends on feeds we do not control and may be unavailable, incomplete or delayed without notice. We
          do not guarantee uptime. Where a paid feature is substantially unavailable through our own fault, the{" "}
          <Link href="/refund-policy" className="font-semibold text-emerald-600 underline underline-offset-2 dark:text-emerald-400">
            Refund Policy
          </Link>{" "}
          says what you are owed.
        </p>
      </PolicySection>

      <PolicySection title="Limitation of liability">
        <p>
          To the extent permitted by law, {COMPANY.legalName} is not liable for any trading or investment loss, lost
          profit, or indirect or consequential loss arising from your use of this platform or from reliance on anything
          published on it. Nothing here limits liability for fraud or for anything that cannot lawfully be limited.
        </p>
      </PolicySection>

      <PolicySection title="Third-party names and links">
        <p>
          Company names, tickers, logos and index names belong to their respective owners and are used to identify the
          companies and indices being described. Their use implies no affiliation with or endorsement by those owners.
          News headlines link to the publisher; we do not control and are not responsible for what is on the other end.
        </p>
      </PolicySection>

      <PolicySection title="Governing law and contact">
        <p>
          This disclaimer is governed by the laws of India, and the courts at the place of our registered office have
          exclusive jurisdiction over any dispute arising from it.
        </p>
        <p>
          Questions go to{" "}
          <a href={`mailto:${CONTACT.support}`} className="font-semibold text-emerald-600 underline underline-offset-2 dark:text-emerald-400">
            {CONTACT.support}
          </a>
          ; complaints to {CONTACT.grievanceOfficer} at{" "}
          <a href={`mailto:${CONTACT.grievanceEmail}`} className="font-semibold text-emerald-600 underline underline-offset-2 dark:text-emerald-400">
            {CONTACT.grievanceEmail}
          </a>
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
