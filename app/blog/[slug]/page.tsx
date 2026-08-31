import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthHeader } from "../../components/auth-header";
import { BackToTop } from "../../components/back-to-top";
import { JsonLd } from "../../components/json-ld";
import { SiteFooter } from "../../components/site-footer";
import { getPublishedPostBySlug } from "../../lib/blog";
import { renderPostHtml } from "../../lib/blog-markdown";
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

const ARTICLE_BODY_CLASS =
  "mt-8 space-y-4 text-base leading-relaxed text-slate-700 [&_a]:text-emerald-600 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-emerald-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_img]:rounded-2xl [&_li]:ml-5 [&_ol]:list-decimal [&_p]:leading-relaxed [&_ul]:list-disc dark:text-slate-300 dark:[&_code]:bg-slate-800";

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

        <article className="mx-auto max-w-3xl">
          <Link href="/blog" className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            ← Blog
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl dark:text-white">{post.title}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {post.publishedAt ? formatDate(post.publishedAt) : ""} · {post.authorName}
          </p>
          {post.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- admin-supplied external URL, not an optimizable local asset.
            <img src={post.coverImageUrl} alt="" className="mt-6 w-full rounded-[24px] object-cover" />
          )}
          <div className={ARTICLE_BODY_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
        </article>

        <SiteFooter />
      </div>

      <BackToTop />
    </main>
  );
}
