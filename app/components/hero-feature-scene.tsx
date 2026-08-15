"use client";

import Image from "next/image";
import Link from "next/link";
import { featureShot } from "../lib/feature-shots";
import type { HeroShowcase, PaletteKey } from "../lib/hero-rotation";
import { TIER_LABEL } from "../lib/plan-tiers";
import { CompanyLogo } from "./company-logo";
import { LILAC, MINT, SAND, SceneCard, SKY, type ScenePalette } from "./hero-scenes";

/**
 * The slide for an AI feature that has no bespoke scene of its own.
 *
 * Fourteen of the eighteen features are in this position, and the alternative to a generic slide is
 * the status quo, where the landing page simply never mentioned them. So this is built to read as a
 * product shot rather than as a placeholder: the left column argues for the feature and the right
 * column shows the shape of what it puts on screen — the same headers, the same three-column rows,
 * the same colouring of a move — inside the identical card chrome the live scenes use.
 *
 * The figures in that panel are illustrative and the footnote says so, in the same words the live
 * scenes already use for their own mock strips. A landing page that showed invented numbers without
 * saying so would be the one dishonest surface on a site whose entire argument is that its figures
 * are measured, so the disclosure is not optional decoration.
 */

const PALETTES: Record<PaletteKey, ScenePalette> = { mint: MINT, sky: SKY, lilac: LILAC, sand: SAND };

/** Green for a gain, red for a fall, and neutral for a cell that is not a direction at all. */
function cellTone(up: boolean | undefined, palette: ScenePalette): string {
  if (up === undefined) return palette.title;
  return up ? "text-emerald-600" : "text-rose-600";
}

export function HeroFeatureScene({ showcase }: { showcase: HeroShowcase }) {
  const palette = PALETTES[showcase.palette];
  const columns = showcase.columns ?? ["", "", ""];
  const rows = showcase.rows ?? [];
  const points = showcase.points ?? [];
  /** The real picture of this feature, when one has been captured. See `../lib/feature-shots`. */
  const shot = featureShot(showcase.key);

  return (
    <SceneCard
      palette={palette}
      eyebrow={showcase.label}
      title={showcase.title}
      badge={showcase.badge}
      // The disclaimer covers the drawn strip, and only that. When a real screenshot is on the card
      // the sentence has to say which half of what you are looking at is a photograph of the
      // product and which half is an illustration, or it would disclaim the true thing too.
      footnote={
        shot
          ? "The screenshot is this feature running in StockersAI. In the strip beneath it the companies, tickers and scrip codes are real and the figures illustrate the layout."
          : "Companies, tickers, BSE scrip codes and ISINs are real; the figures illustrate the layout. The live board is inside the dashboard."
      }
    >
      <div className="grid h-full grid-cols-1 items-start gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        {/* The argument for the feature. */}
        <div className="flex min-w-0 flex-col gap-2.5">
          {/* The plan alone. The feature's name is already the card's eyebrow and the words on the
              button below, and a third copy of it here only crowded the column. */}
          <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-black tracking-wider uppercase ${palette.chip}`}>
            {TIER_LABEL[showcase.tier]} plan
          </span>

          <p className={`text-sm leading-relaxed font-semibold sm:text-base ${palette.title}`}>{showcase.blurb}</p>

          <ul className="flex flex-col gap-1.5">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${showcase.tier === "elite" ? "bg-violet-500" : showcase.tier === "pro" ? "bg-sky-500" : "bg-emerald-500"}`}
                />
                <span className={`text-[12px] leading-relaxed ${palette.muted}`}>{point}</span>
              </li>
            ))}
          </ul>

          <Link
            href={showcase.href}
            className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-slate-700"
          >
            Open {showcase.label}
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        {/* What the feature puts on screen: the photograph when there is one, and the drawn strip
            under it. The strip stays even beside a screenshot — it is where the company marks and
            the column headings are legible at this size, which a scaled-down board is not. */}
        <div className="flex min-h-0 flex-col gap-2.5">
        {shot && (
          <figure
            className={`relative min-h-0 flex-1 overflow-hidden rounded-2xl border shadow-[0_10px_30px_-18px_rgba(15,23,42,0.4)] ${palette.panel}`}
          >
            <Image
              src={shot.src}
              width={shot.width}
              height={shot.height}
              // Named as a screenshot rather than described as a board: a reader on a screen reader
              // should be told this is a picture of the product, not handed the figures inside it,
              // which they cannot act on and which the strip below states properly anyway.
              alt={`Screenshot of the ${showcase.label} board running in StockersAI`}
              className="h-full w-full object-cover object-top"
              // Never the LCP element — the hero's first slide is a live scene, and this one is
              // behind a crossfade — so it loads lazily like every other image on the page.
              loading="lazy"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </figure>
        )}

        <div className={`shrink-0 overflow-hidden rounded-2xl border shadow-[0_10px_30px_-18px_rgba(15,23,42,0.4)] ${palette.panel}`}>
          <table className="w-full table-fixed border-collapse">
            <caption className="sr-only">An illustration of the {showcase.label} board</caption>
            <thead>
              <tr className={`border-b ${palette.rule}`}>
                {columns.map((column, index) => (
                  <th
                    key={column}
                    scope="col"
                    className={`px-3 py-2 text-[10px] font-black tracking-wider uppercase ${palette.muted} ${index === 2 ? "text-right" : "text-left"}`}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.left} className={`border-b last:border-0 ${palette.rule}`}>
                  <td className={`px-3 py-2 text-[12px] font-bold ${palette.title}`}>
                    {/* The company's own mark, from the same store the boards use. A row about an
                        index, a sector or a filing type carries no symbol and gets no mark — a
                        monogram tile for "Metal" would be a face put to something that has none. */}
                    <span className="flex min-w-0 items-center gap-2">
                      {row.symbol && <CompanyLogo symbol={row.symbol} size={22} />}
                      <span className="truncate">{row.left}</span>
                    </span>
                  </td>
                  <td className={`truncate px-3 py-2.5 font-mono text-[11px] ${palette.muted}`}>{row.middle}</td>
                  <td className={`px-3 py-2.5 text-right font-mono text-[12px] font-black ${cellTone(row.up, palette)}`}>
                    {row.right}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      </div>
    </SceneCard>
  );
}
