"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { AiReportModal as AiReportModalImpl } from "./ai-report-modal";
import { useOnceOpen } from "./use-once-open";

/**
 * The AI report sheet, loaded the first time somebody opens one.
 *
 * Five boards render this modal — today's picks, the dip screener, tomorrow's screener, the ETF
 * desk and the landing research panel — and every one of them had it as a static import. That put
 * the report, the performance charts, the competitor table and the modal shell into the bundle of
 * each of those pages, for a panel most readers never open.
 *
 * The gate lives in here rather than at the five call sites for two reasons: `next/dynamic` only
 * fetches a chunk when the component is first *rendered*, so a modal permanently in the tree with
 * `open={false}` downloads exactly as a static import would; and doing that check five times is
 * five chances for one of them to be forgotten.
 *
 * The type is taken from the real module with `import type`, which is erased at compile time — so
 * this file names the component's props without pulling a byte of it into the caller's bundle.
 */
type AiReportModalProps = ComponentProps<typeof AiReportModalImpl>;

const LazyAiReportModal = dynamic(() => import("./ai-report-modal").then((module) => module.AiReportModal));

export function AiReportModal(props: AiReportModalProps) {
  // Latched, not mirrored: the shell animates on the way out and needs to stay mounted through it.
  const everOpened = useOnceOpen(props.open);
  if (!everOpened) return null;

  return <LazyAiReportModal {...props} />;
}
