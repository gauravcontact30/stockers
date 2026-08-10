import { BseAccuracyLookup } from "./bse-accuracy-lookup";

export function AccuracyMatrixSection() {
  return (
    <section
      id="accuracy"
      className="scroll-mt-28 overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_80px_-38px_rgba(15,23,42,0.4)] transition-colors dark:border-slate-800 dark:bg-slate-900"
    >
      <BseAccuracyLookup />
    </section>
  );
}
