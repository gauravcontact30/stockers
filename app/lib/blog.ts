import "server-only";

import { randomBytes } from "node:crypto";
import { eq, isUniqueViolation, supabaseRequest } from "./supabase";
import type { BlogPost, BlogPostStatus, BlogTransitionAction } from "./blog-post";

type BlogPostRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  cover_image_url: string | null;
  body_markdown: string;
  author_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  published_at: string | null;
  created_by: string | null;
};

function fromRow(row: BlogPostRow): BlogPost {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    coverImageUrl: row.cover_image_url,
    bodyMarkdown: row.body_markdown,
    authorName: row.author_name,
    status: row.status as BlogPostStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
    publishedAt: row.published_at,
    createdBy: row.created_by,
  };
}

/** Every published post, newest first. */
export async function listPublishedPosts(): Promise<BlogPost[]> {
  const rows = await supabaseRequest<BlogPostRow>({ method: "GET", path: "blog_posts?status=eq.published&select=*" });
  return rows.map(fromRow).sort((a, b) => ((a.publishedAt ?? "") < (b.publishedAt ?? "") ? 1 : -1));
}

/** A single published post by its URL slug, or null — including when the slug exists but isn't published. */
export async function getPublishedPostBySlug(slug: string): Promise<BlogPost | null> {
  const rows = await supabaseRequest<BlogPostRow>({
    method: "GET",
    path: `blog_posts?slug=${eq(slug)}&status=eq.published&select=*&limit=1`,
  });
  return rows.length > 0 ? fromRow(rows[0]) : null;
}

/** Every post regardless of status, for the admin dashboard — most recently touched first. */
export async function listAllPosts(): Promise<BlogPost[]> {
  const rows = await supabaseRequest<BlogPostRow>({ method: "GET", path: "blog_posts?select=*" });
  return rows.map(fromRow).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "post"
  );
}

export type CreateBlogPostInput = {
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  bodyMarkdown: string;
  authorName: string;
  createdBy: string | null;
};

/**
 * Creates a draft, deriving a URL slug from the title.
 *
 * A colliding slug is not checked for up front — that read-then-insert has a gap two simultaneous
 * creates from the same title would both pass. Instead this retries the insert with a numeric
 * suffix each time Postgres reports the unique constraint on `slug` (23505), the same way
 * `store.ts`'s `insert` treats a colliding email.
 */
export async function createPost(input: CreateBlogPostInput): Promise<BlogPost> {
  const base = slugify(input.title);
  const now = new Date().toISOString();
  const row = {
    id: `post_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`,
    title: input.title,
    excerpt: input.excerpt,
    cover_image_url: input.coverImageUrl,
    body_markdown: input.bodyMarkdown,
    author_name: input.authorName,
    status: "draft",
    created_at: now,
    updated_at: now,
    approved_at: null,
    published_at: null,
    created_by: input.createdBy,
  };

  let slug = base;
  for (let suffix = 2; suffix < 50; suffix += 1) {
    try {
      const rows = await supabaseRequest<BlogPostRow>({
        method: "POST",
        path: "blog_posts",
        body: { ...row, slug },
        returnRepresentation: true,
      });
      return fromRow(rows[0]);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      slug = `${base}-${suffix}`;
    }
  }

  throw new Error(`Could not find a free slug for "${input.title}".`);
}

export type BlogPostEdit = Partial<{
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  bodyMarkdown: string;
  authorName: string;
}>;

const EDIT_COLUMN: Record<keyof BlogPostEdit, keyof BlogPostRow> = {
  title: "title",
  excerpt: "excerpt",
  coverImageUrl: "cover_image_url",
  bodyMarkdown: "body_markdown",
  authorName: "author_name",
};

/** Edits a post's content fields. Does not change `status` — see `transitionBlogPost` for that. */
export async function updatePost(id: string, patch: BlogPostEdit): Promise<BlogPost | null> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(patch)) {
    const column = EDIT_COLUMN[key as keyof BlogPostEdit];
    if (column && value !== undefined) row[column] = value;
  }

  const rows = await supabaseRequest<BlogPostRow>({
    method: "PATCH",
    path: `blog_posts?id=${eq(id)}`,
    body: row,
    returnRepresentation: true,
  });
  return rows.length > 0 ? fromRow(rows[0]) : null;
}

export async function deletePost(id: string): Promise<boolean> {
  const rows = await supabaseRequest<BlogPostRow>({
    method: "DELETE",
    path: `blog_posts?id=${eq(id)}`,
    returnRepresentation: true,
  });
  return rows.length > 0;
}

const TRANSITION_FROM: Record<BlogTransitionAction, BlogPostStatus> = {
  approve: "draft",
  publish: "approved",
  reject: "approved",
  unpublish: "published",
};

const TRANSITION_TO: Record<BlogTransitionAction, BlogPostStatus> = {
  approve: "approved",
  publish: "published",
  reject: "draft",
  unpublish: "draft",
};

/**
 * Moves a post along the draft -> approved -> published state machine.
 *
 * The PATCH is filtered on both the post's id and the status the action requires it to currently
 * be in, so the transition is atomic: a post already moved by a concurrent request, or simply not
 * in the right state for this action, matches zero rows and this returns null rather than racing a
 * separate read.
 */
export async function transitionBlogPost(id: string, action: BlogTransitionAction): Promise<BlogPost | null> {
  const fromStatus = TRANSITION_FROM[action];
  const toStatus = TRANSITION_TO[action];
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = { status: toStatus, updated_at: now };
  if (action === "approve") patch.approved_at = now;
  if (action === "publish") patch.published_at = now;
  if (action === "reject" || action === "unpublish") patch.published_at = null;

  const rows = await supabaseRequest<BlogPostRow>({
    method: "PATCH",
    path: `blog_posts?id=${eq(id)}&status=${eq(fromStatus)}`,
    body: patch,
    returnRepresentation: true,
  });
  return rows.length > 0 ? fromRow(rows[0]) : null;
}
