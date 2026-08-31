import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeader } from "../components/auth-header";
import { BackToTop } from "../components/back-to-top";
import { JsonLd } from "../components/json-ld";
import { SiteFooter } from "../components/site-footer";
import { listPublishedPosts } from "../lib/blog";
import { breadcrumbSchema, graph, pageMetadata, webPageSchema } from "../lib/seo";
import type { BlogPost } from "../lib/blog-post";

const BLOG_DESCRIPTION = "StockersAI research notes, product updates and market commentary on Indian equities.";

export const metadata: Metadata = pageMetadata({
  title: "Blog",
  description: BLOG_DESCRIPTION,
  path: "/blog",
  keywords: ["StockersAI blog", "Indian stock market blog", "AI stock research articles"],
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function readingMinutes(post: BlogPost): string {
  const words = post.bodyMarkdown.trim().split(/\s+/).filter(Boolean).length || post.excerpt.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 180))} min read`;
}

function byline(post: BlogPost): string {
  const date = post.publishedAt ? formatDate(post.publishedAt) : "Published";
  return `${date} / ${post.authorName} / ${readingMinutes(post)}`;
}

function PostImage({ post, featured = false }: { post: BlogPost; featured?: boolean }) {
  if (post.coverImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- admin-supplied external URL, not an optimizable local asset.
      <img
        src={post.coverImageUrl}
        alt=""
        className={`${featured ? "h-28 sm:h-32 lg:h-36" : "h-24"} w-full bg-slate-50 object-contain p-3 transition duration-500 group-hover:scale-[1.03] dark:bg-slate-950/60`}
      />
    );
  }

  return (
    <div
      className={`${featured ? "h-28 sm:h-32 lg:h-36" : "h-24"} flex w-full items-center justify-center bg-[linear-gradient(135deg,#ecfdf5_0%,#f8fafc_48%,#e0f2fe_100%)] p-4 dark:bg-[linear-gradient(135deg,#064e3b_0%,#0f172a_52%,#082f49_100%)]`}
    >
      <div className="w-full max-w-xs">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300">StockersAI Research</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[0, 1, 2, 3, 4, 5].map((slot) => (
            <span key={slot} className="h-2 rounded-full bg-white/80 shadow-sm dark:bg-white/20" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function BlogIndexPage() {
  // A deployment that has not yet applied `supabase/schema.sql` (or has no Supabase configured at
  // all) throws here. There is nothing a visitor can do about that, so it is treated the same as
  // "no posts exist yet" rather than surfaced as an error page.
  let posts: BlogPost[] = [];
  try {
    posts = await listPublishedPosts();
  } catch {
    posts = [];
  }

  const featuredPost = posts[0];
  const remainingPosts = posts.slice(1);
  const writerCount = new Set(posts.map((post) => post.authorName)).size;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 px-safe py-12 text-slate-700 transition-colors dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
      <JsonLd
        schema={graph(
          webPageSchema({
            name: "Blog",
            description: BLOG_DESCRIPTION,
            path: "/blog",
            breadcrumb: breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Blog", path: "/blog" },
            ]),
          }),
        )}
      />
      <div className="gutter">
        <AuthHeader />

        <div className="mx-auto max-w-7xl">
          <section className="grid gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
            <div className="max-w-3xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400">StockersAI Journal</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl dark:text-white">
                Clear market notes for Indian equity investors
              </h1>
              <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-400">
                Research notes, product updates and market commentary from the StockersAI team, written for fast scanning before deeper stock work.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-white/75 p-3 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
              <div>
                <p className="text-2xl font-black tabular-nums text-slate-950 dark:text-white">{posts.length}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Articles</p>
              </div>
              <div>
                <p className="text-2xl font-black tabular-nums text-slate-950 dark:text-white">
                  {featuredPost?.publishedAt ? formatDate(featuredPost.publishedAt).split(" ").slice(0, 2).join(" ") : "--"}
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Latest</p>
              </div>
              <div>
                <p className="text-2xl font-black tabular-nums text-slate-950 dark:text-white">{writerCount || "--"}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Writers</p>
              </div>
            </div>
          </section>

          <section className="mb-32">
            {!featuredPost ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-10 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">No posts published yet.</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Published research notes will appear here automatically.</p>
              </div>
            ) : (
              <>
                <Link
                  href={`/blog/${featuredPost.slug}`}
                  className="group grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_-45px_rgba(15,23,42,0.45)] ring-1 ring-white/70 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_28px_90px_-45px_rgba(5,150,105,0.35)] lg:grid-cols-[20rem_minmax(0,1fr)] dark:border-slate-800 dark:bg-slate-900 dark:ring-white/5 dark:hover:border-emerald-500/70"
                >
                  <div className="overflow-hidden border-b border-slate-100 lg:border-b-0 lg:border-r dark:border-slate-800">
                    <PostImage post={featuredPost} featured />
                  </div>
                  <article className="flex flex-col p-6 sm:p-7">
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-400">Featured research note</p>
                    <h2 className="mt-3 text-2xl font-semibold leading-tight text-slate-950 group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-300">
                      {featuredPost.title}
                    </h2>
                    <p className="mt-3 line-clamp-3 text-sm leading-7 text-slate-600 dark:text-slate-400">{featuredPost.excerpt}</p>
                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{byline(featuredPost)}</p>
                      <span className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white transition group-hover:bg-emerald-600 dark:bg-white dark:text-slate-950 dark:group-hover:bg-emerald-400">
                        Read article
                      </span>
                    </div>
                  </article>
                </Link>

              {remainingPosts.length > 0 && (
                <section className="mt-10">
                  <div className="flex items-end justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-sky-600 dark:text-sky-400">More analysis</p>
                      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Latest articles</h2>
                    </div>
                    <p className="hidden text-sm text-slate-500 sm:block dark:text-slate-400">Newest first</p>
                  </div>

                  <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {remainingPosts.map((post) => (
                      <Link
                        key={post.id}
                        href={`/blog/${post.slug}`}
                        className="group grid grid-cols-[7.5rem_minmax(0,1fr)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_20px_60px_-35px_rgba(5,150,105,0.35)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500/70"
                      >
                        <div className="overflow-hidden">
                          <PostImage post={post} />
                        </div>
                        <article className="flex min-w-0 flex-1 flex-col p-4">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{byline(post)}</p>
                          <h3 className="mt-3 text-lg font-semibold leading-snug text-slate-950 group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-300">
                            {post.title}
                          </h3>
                          <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{post.excerpt}</p>
                        </article>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              </>
            )}
          </section>
        </div>

        <SiteFooter />
      </div>

      <BackToTop />
    </main>
  );
}
