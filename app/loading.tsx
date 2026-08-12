function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-slate-200/80 dark:bg-slate-800 ${className}`} />;
}

export default function Loading() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 p-4 text-slate-700 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 sm:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/85 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <SkeletonLine className="h-8 w-40" />
          <div className="flex gap-2">
            <SkeletonLine className="h-8 w-8" />
            <SkeletonLine className="h-8 w-24" />
          </div>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_-36px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:bg-slate-900">
          <div className="aspect-[16/7] min-h-64 animate-pulse bg-slate-100 dark:bg-slate-800/70" />
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <section key={index} className="rounded-[24px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <SkeletonLine className="h-5 w-40" />
              <SkeletonLine className="mt-3 h-4 w-full" />
              <SkeletonLine className="mt-2 h-4 w-2/3" />
              <div className="mt-5 space-y-2">
                <SkeletonLine className="h-12 w-full rounded-xl" />
                <SkeletonLine className="h-12 w-full rounded-xl" />
                <SkeletonLine className="h-12 w-full rounded-xl" />
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
