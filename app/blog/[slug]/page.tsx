import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthHeader } from "../../components/auth-header";
import { BackToTop } from "../../components/back-to-top";
import { JsonLd } from "../../components/json-ld";
import { SiteFooter } from "../../components/site-footer";
import { getPublishedPostBySlug } from "../../lib/blog";
import { renderPostHtml } from "../../lib/blog-markdown";
import type { BlogPost } from "../../lib/blog-post";
import { breadcrumbSchema, graph, pageMetadata, webPageSchema } from "../../lib/seo";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;

  // Same reasoning as the page body below: a Supabase misconfiguration or a schema that has not
  // been applied yet must not throw here, it must just fall through to the not-found metadata.
  let post = null;
  try {
    post = await getPublishedPostBySlug(slug);
  } catch {
    post = null;
  }

  if (!post) {
    return pageMetadata({ title: "Blog", description: "StockersAI blog.", path: `/blog/${slug}`, indexable: false });
  }
  return pageMetadata({ title: post.title, description: post.excerpt, path: `/blog/${post.slug}` });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function readingMinutes(post: BlogPost): string {
  const words = post.bodyMarkdown.trim().split(/\s+/).filter(Boolean).length || post.excerpt.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 180))} min read`;
}

function ArticleCover({ post }: { post: BlogPost }) {
  if (post.coverImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- admin-supplied external URL, not an optimizable local asset.
      <img
        src={post.coverImageUrl}
        alt=""
        className="h-40 w-full rounded-2xl border border-slate-200 bg-slate-100 object-cover shadow-sm dark:border-slate-800 dark:bg-slate-800"
      />
    );
  }

  return (
    <div className="flex h-40 w-full items-center justify-center rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#f8fafc_50%,#e0f2fe_100%)] p-5 shadow-sm dark:border-slate-800 dark:bg-[linear-gradient(135deg,#064e3b_0%,#0f172a_55%,#082f49_100%)]">
      <div className="w-full">
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

const ARTICLE_BODY_CLASS =
  "space-y-5 text-[17px] leading-8 text-slate-700 [&_a]:font-semibold [&_a]:text-emerald-700 [&_a]:underline [&_a]:decoration-emerald-300 [&_blockquote]:rounded-r-2xl [&_blockquote]:border-l-4 [&_blockquote]:border-emerald-300 [&_blockquote]:bg-emerald-50/60 [&_blockquote]:py-3 [&_blockquote]:pl-5 [&_blockquote]:pr-4 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_h1]:mt-10 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-slate-950 [&_h2]:mt-10 [&_h2]:border-t [&_h2]:border-slate-200 [&_h2]:pt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-slate-950 [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-slate-950 [&_img]:rounded-2xl [&_img]:border [&_img]:border-slate-200 [&_li]:ml-5 [&_ol]:list-decimal [&_p]:leading-8 [&_strong]:font-semibold [&_strong]:text-slate-950 [&_ul]:list-disc dark:text-slate-300 dark:[&_a]:text-emerald-300 dark:[&_blockquote]:border-emerald-500 dark:[&_blockquote]:bg-emerald-500/10 dark:[&_code]:bg-slate-800 dark:[&_h1]:text-white dark:[&_h2]:border-slate-800 dark:[&_h2]:text-white dark:[&_h3]:text-white dark:[&_img]:border-slate-800 dark:[&_strong]:text-white";

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;

  // A Supabase misconfiguration or an unapplied schema throws here. There is nothing a visitor can
  // do about that either, and it is indistinguishable from the post simply not existing, so it is
  // treated the same as the null case just below.
  let post = null;
  try {
    post = await getPublishedPostBySlug(slug);
  } catch {
    post = null;
  }
  if (!post) notFound();

  const html = renderPostHtml(post.bodyMarkdown);
  const published = post.publishedAt ? formatDate(post.publishedAt) : "Published";

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 px-safe py-12 text-slate-700 transition-colors dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
      <JsonLd
        schema={graph(
          webPageSchema({
            name: post.title,
            description: post.excerpt,
            path: `/blog/${post.slug}`,
            breadcrumb: breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Blog", path: "/blog" },
              { name: post.title, path: `/blog/${post.slug}` },
            ]),
          }),
        )}
      />
      <div className="gutter">
        <AuthHeader />

        <article className="mx-auto mt-10 max-w-6xl">
          <Link
            href="/blog"
            className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
          >
            Back to blog
          </Link>

          <header className="mt-6 grid gap-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-45px_rgba(15,23,42,0.45)] sm:p-8 lg:grid-cols-[minmax(0,1fr)_20rem] dark:border-slate-800 dark:bg-slate-900">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.32em] text-emerald-600 dark:text-emerald-400">StockersAI Journal</p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl dark:text-white">{post.title}</h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-400">{post.excerpt}</p>
            </div>

            <aside className="space-y-4">
              <ArticleCover post={post} />
              <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Published</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{published}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Read</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{readingMinutes(post)}</p>
                </div>
                <div className="col-span-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Author</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{post.authorName}</p>
                </div>
              </div>
            </aside>
          </header>

          <div className="mb-28 mt-8 grid gap-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
              <div className="mx-auto max-w-3xl">
                <div className={ARTICLE_BODY_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            </div>

            <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-bold">Research note</p>
                <p>For research purposes only. This is not investment advice, and market risk applies.</p>
              </div>
            </aside>
          </div>
        </article>

        <SiteFooter />
      </div>

      <BackToTop />
    </main>
  );
}
