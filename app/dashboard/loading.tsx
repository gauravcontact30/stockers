function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800 ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden rounded-[28px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:block">
          <Block className="h-10 w-44" />
          <div className="mt-6 space-y-2">
            {Array.from({ length: 8 }, (_, index) => (
              <Block key={index} className="h-10 w-full rounded-xl" />
            ))}
          </div>
        </aside>

        <section className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Block className="h-5 w-40" />
              <Block className="mt-3 h-8 w-72 max-w-full" />
            </div>
            <Block className="h-10 w-32 rounded-full" />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Block className="h-28" />
            <Block className="h-28" />
            <Block className="h-28" />
          </div>
          <Block className="mt-5 h-80 w-full" />
        </section>
      </div>
    </main>
  );
}
