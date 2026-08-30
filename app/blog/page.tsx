import type { Metadata } from "next";
import Link from "next/link";
import { listPublishedPosts } from "../lib/blog";
import { pageMetadata } from "../lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Blog",
  description: "StockersAI research notes, product updates and market commentary on Indian equities.",
  path: "/blog",
  keywords: ["StockersAI blog", "Indian stock market blog", "AI stock research articles"],
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function BlogIndexPage() {
  const posts = await listPublishedPosts();

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 px-safe py-12 text-slate-700 transition-colors dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
      <div className="gutter">
        <div className="mx-auto max-w-4xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400">StockersAI</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl dark:text-white">Blog</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Research notes, product updates and market commentary from the StockersAI team.
          </p>

          {posts.length === 0 ? (
            <p className="mt-10 text-sm text-slate-500 dark:text-slate-400">No posts published yet.</p>
          ) : (
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  className="group flex flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white transition hover:border-emerald-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
                >
                  {post.coverImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- admin-supplied external URL, not an optimizable local asset.
                    <img src={post.coverImageUrl} alt="" className="h-44 w-full object-cover" />
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      {post.publishedAt ? formatDate(post.publishedAt) : ""} · {post.authorName}
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-slate-900 group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-400">
                      {post.title}
                    </h2>
                    <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{post.excerpt}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
