export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-700 dark:bg-slate-950 dark:text-slate-300">
      <div className="h-[3px] w-full bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500" />
      <div className="gutter py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <div className="h-12 w-48 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
          <section className="min-h-[420px] rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] dark:border-slate-800 dark:bg-slate-900">
            <div className="h-6 w-56 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
            <div className="mt-4 h-4 w-full max-w-3xl animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="h-44 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-44 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-44 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
