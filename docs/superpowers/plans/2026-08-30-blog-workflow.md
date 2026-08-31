# Blog Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Supabase-backed blog to StockersAI: a public `/blog` + `/blog/[slug]`, a "Blog" header nav link, an admin create/approve/publish workflow at `/posts`, and hide the landing page's Client reviews section.

**Architecture:** A new `blog_posts` Supabase table, reached only through a server-only `app/lib/blog.ts` (same shape as `app/lib/store.ts`'s Supabase backend). An explicit `draft -> approved -> published` state machine is enforced with conditional PATCHes filtered on the post's current status, so an illegal transition matches zero rows instead of racing a read-then-write. Public pages read `app/lib/blog.ts` directly (no API route for reads); the admin surface goes through one route, `app/api/admin/blog/route.ts`, gated the same way `app/api/admin/users/route.ts` is.

**Tech Stack:** Next.js App Router, TypeScript, Supabase/PostgREST (via the existing hand-rolled `fetch` client in `app/lib/supabase.ts`), `marked` for Markdown rendering, Jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-30-blog-workflow-design.md`

## Global Constraints

- No new user role — create/approve/publish all stay behind the existing `admin` role (`AppUser.role === "admin"`).
- Blog posts require Supabase configured. There is no JSON-file fallback (unlike `app/lib/store.ts`).
- Post body is Markdown, rendered to HTML server-side with `marked`. No sanitization pass — authors are always admins.
- Cover image is a plain URL field. No file upload.
- Every timestamp column is ISO-8601 UTC stored as `text`, matching every other table in `supabase/schema.sql` (see that file's note on `users.created_at`).
- Every generated id follows the existing `<prefix>_<base36 time>_<random 4-byte hex>` shape (see `createUser` in `app/lib/store.ts`).
- Valid status transitions: `draft -> approved`, `approved -> published`, `approved -> draft` (reject), `published -> draft` (unpublish). Never `draft -> published` directly.

---

### Task 1: Blog post types and the Supabase data layer

**Files:**
- Create: `app/lib/blog-post.ts`
- Create: `app/lib/blog.ts`
- Modify: `supabase/schema.sql` (append a new section, following the existing `client_reviews` section's style)
- Test: `test/lib/blog.test.ts`

**Interfaces:**
- Consumes: `supabaseRequest`, `eq`, `isUniqueViolation` from `app/lib/supabase.ts` (all already exported, signatures unchanged).
- Produces (for later tasks):
  - `type BlogPostStatus = "draft" | "approved" | "published"` (`app/lib/blog-post.ts`)
  - `type BlogTransitionAction = "approve" | "publish" | "reject" | "unpublish"` (`app/lib/blog-post.ts`)
  - `const BLOG_TRANSITION_ACTIONS: BlogTransitionAction[]` (`app/lib/blog-post.ts`)
  - `type BlogPost = { id, title, slug, excerpt, coverImageUrl: string | null, bodyMarkdown, authorName, status: BlogPostStatus, createdAt, updatedAt, approvedAt: string | null, publishedAt: string | null, createdBy: string | null }` (`app/lib/blog-post.ts`)
  - `type CreateBlogPostInput = { title, excerpt, coverImageUrl: string | null, bodyMarkdown, authorName, createdBy: string | null }` (`app/lib/blog.ts`)
  - `type BlogPostEdit = Partial<{ title, excerpt, coverImageUrl: string | null, bodyMarkdown, authorName }>` (`app/lib/blog.ts`)
  - `listPublishedPosts(): Promise<BlogPost[]>`
  - `getPublishedPostBySlug(slug: string): Promise<BlogPost | null>`
  - `listAllPosts(): Promise<BlogPost[]>`
  - `createPost(input: CreateBlogPostInput): Promise<BlogPost>`
  - `updatePost(id: string, patch: BlogPostEdit): Promise<BlogPost | null>`
  - `deletePost(id: string): Promise<boolean>`
  - `transitionBlogPost(id: string, action: BlogTransitionAction): Promise<BlogPost | null>` (`null` means the post doesn't exist or isn't in the state the action requires)

- [ ] **Step 1: Add the `blog_posts` table to the schema**

Append to `supabase/schema.sql`, directly after the `client_reviews` section (after its closing `revoke all on public.client_reviews from anon, authenticated;` line) and before the `stock catalogue` section comment:

```sql
-- ---------------------------------------------------------------------------
-- Blog posts
-- ---------------------------------------------------------------------------
--
-- The public blog at /blog, authored and moderated from the super admin dashboard's Blog Posts
-- tab (/posts). Every post moves through an explicit draft -> approved -> published state machine
-- (app/lib/blog.ts) — there is no direct draft -> published transition, so a post always passes
-- through an approval step before it is public.
--
-- Reached the same way `users` is: RLS enabled, no policies, service_role key only. The public
-- blog pages read through `app/lib/blog.ts` on the server, never directly from the browser.

create table if not exists public.blog_posts (
  -- Generated by the application (`post_<base36 time>_<random>`), like every other id here.
  id text primary key,

  title text not null,

  -- The URL segment at /blog/<slug>. Derived from the title at creation time and de-duplicated
  -- with a numeric suffix on collision; admin-editable afterwards, so a published URL only ever
  -- changes if an admin deliberately changes it.
  slug text not null unique,

  excerpt text not null,

  -- A URL to an already-hosted image, not an upload — this app has no object storage yet (see the
  -- note on `client_reviews` above), and asking an admin to paste a link avoids adding one just for
  -- blog cover art.
  cover_image_url text,

  body_markdown text not null,

  -- Free text, not a foreign key: there is no separate author role, every post is written by an
  -- admin, and this is the byline shown on the page rather than an account reference.
  author_name text not null,

  status text not null default 'draft' check (status in ('draft', 'approved', 'published')),

  -- ISO-8601 UTC as text, like every other timestamp in this schema — see the note on
  -- `users.created_at` for why.
  created_at text not null,
  updated_at text not null,
  approved_at text,
  published_at text,

  -- The admin who created the post. No foreign key, for the same reason `portfolio_holdings.user_id`
  -- has none: the account store has two backends and only one of them is this database.
  created_by text
);

-- The public blog page's only query: published posts, newest first.
create index if not exists blog_posts_published_idx
  on public.blog_posts (published_at desc)
  where status = 'published';

-- The admin dashboard's list: every post, most recently touched first.
create index if not exists blog_posts_updated_at_idx on public.blog_posts (updated_at desc);

alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from anon, authenticated;
```

This is a schema file, not executable code the test suite runs against — there is no automated test for it. Verify by reading the appended block back and confirming it parses as valid SQL by eye (balanced parens, every statement ends in `;`, matches the `create table if not exists` / `alter table ... enable row level security` / `revoke all ...` shape every other table in this file uses).

- [ ] **Step 2: Write the pure types file**

Create `app/lib/blog-post.ts`:

```typescript
/** What a blog post is, and the states it can be in. */
export type BlogPostStatus = "draft" | "approved" | "published";

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImageUrl: string | null;
  bodyMarkdown: string;
  authorName: string;
  status: BlogPostStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  publishedAt: string | null;
  createdBy: string | null;
};

/**
 * The only moves a post can make: draft -> approved -> published, with `reject` and `unpublish`
 * as the ways back. There is no `draft -> published` action — publishing always passes through an
 * approval step first.
 */
export type BlogTransitionAction = "approve" | "publish" | "reject" | "unpublish";

export const BLOG_TRANSITION_ACTIONS: BlogTransitionAction[] = ["approve", "publish", "reject", "unpublish"];
```

- [ ] **Step 3: Write the failing tests for the data layer**

Create `test/lib/blog.test.ts`:

```typescript
// The Supabase-backed blog store.
//
// Same pattern as test/lib/supabase-store.test.ts: the real app/lib/blog.ts runs against a mocked
// `fetch`, and every test asserts on the HTTP request that came out the other side. Blog posts have
// no file-backend fallback, so — unlike the account store's suite — there is only one backend here.

import {
  createPost,
  deletePost,
  getPublishedPostBySlug,
  listAllPosts,
  listPublishedPosts,
  transitionBlogPost,
  updatePost,
} from "../../app/lib/blog";
import { SupabaseError } from "../../app/lib/supabase";

const URL_BASE = "https://project-under-test.supabase.co";
const SERVICE_KEY = "service-role-key-under-test";

type Call = { url: string; method: string; body: Record<string, unknown> | null };

let fetchMock: jest.Mock;

function reply(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Map(),
  } as unknown as Response;
}

function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: init?.method ?? "GET",
    body: init?.body ? JSON.parse(init.body as string) : null,
  }));
}

const ROW = {
  id: "post_stored",
  title: "How BSE gainers actually work",
  slug: "how-bse-gainers-actually-work",
  excerpt: "A short primer on what moves a gainers board.",
  cover_image_url: "https://example.com/cover.png",
  body_markdown: "# Heading\n\nBody text.",
  author_name: "StockersAI Team",
  status: "draft",
  created_at: "2026-08-20T00:00:00.000Z",
  updated_at: "2026-08-20T00:00:00.000Z",
  approved_at: null,
  published_at: null,
  created_by: "user_admin",
};

beforeEach(() => {
  process.env.SUPABASE_URL = URL_BASE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;

  fetchMock = jest.fn(async () => reply([]));
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("listPublishedPosts", () => {
  it("asks only for published posts and maps rows to camelCase", async () => {
    fetchMock.mockResolvedValueOnce(reply([{ ...ROW, status: "published", published_at: "2026-08-21T00:00:00.000Z" }]));

    const posts = await listPublishedPosts();

    const [call] = calls();
    expect(call.url).toContain("blog_posts?status=eq.published");
    expect(posts).toEqual([
      {
        id: "post_stored",
        title: "How BSE gainers actually work",
        slug: "how-bse-gainers-actually-work",
        excerpt: "A short primer on what moves a gainers board.",
        coverImageUrl: "https://example.com/cover.png",
        bodyMarkdown: "# Heading\n\nBody text.",
        authorName: "StockersAI Team",
        status: "published",
        createdAt: "2026-08-20T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
        approvedAt: null,
        publishedAt: "2026-08-21T00:00:00.000Z",
        createdBy: "user_admin",
      },
    ]);
  });

  it("sorts newest published first", async () => {
    fetchMock.mockResolvedValueOnce(
      reply([
        { ...ROW, id: "post_older", status: "published", published_at: "2026-08-10T00:00:00.000Z" },
        { ...ROW, id: "post_newer", status: "published", published_at: "2026-08-25T00:00:00.000Z" },
      ]),
    );

    const posts = await listPublishedPosts();

    expect(posts.map((post) => post.id)).toEqual(["post_newer", "post_older"]);
  });
});

describe("getPublishedPostBySlug", () => {
  it("filters by slug and published status", async () => {
    fetchMock.mockResolvedValueOnce(reply([{ ...ROW, status: "published", published_at: "2026-08-21T00:00:00.000Z" }]));

    const post = await getPublishedPostBySlug("how-bse-gainers-actually-work");

    const [call] = calls();
    expect(call.url).toContain("slug=eq.how-bse-gainers-actually-work");
    expect(call.url).toContain("status=eq.published");
    expect(post?.id).toBe("post_stored");
  });

  it("returns null when nothing matches", async () => {
    const post = await getPublishedPostBySlug("missing");
    expect(post).toBeNull();
  });
});

describe("listAllPosts", () => {
  it("fetches every status and sorts by most recently updated", async () => {
    fetchMock.mockResolvedValueOnce(
      reply([
        { ...ROW, id: "post_a", updated_at: "2026-08-10T00:00:00.000Z" },
        { ...ROW, id: "post_b", updated_at: "2026-08-25T00:00:00.000Z" },
      ]),
    );

    const posts = await listAllPosts();

    const [call] = calls();
    expect(call.url).not.toContain("status=eq.");
    expect(posts.map((post) => post.id)).toEqual(["post_b", "post_a"]);
  });
});

describe("createPost", () => {
  it("inserts a draft with a slug derived from the title", async () => {
    fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => reply([JSON.parse(init.body as string)]));

    const post = await createPost({
      title: "How BSE Gainers Actually Work!",
      excerpt: "A short primer.",
      coverImageUrl: null,
      bodyMarkdown: "Body text here, twenty chars.",
      authorName: "StockersAI Team",
      createdBy: "user_admin",
    });

    const [call] = calls();
    expect(call.method).toBe("POST");
    expect(call.body?.slug).toBe("how-bse-gainers-actually-work");
    expect(call.body?.status).toBe("draft");
    expect(post.status).toBe("draft");
    expect(post.slug).toBe("how-bse-gainers-actually-work");
  });

  it("retries with a numeric suffix when the slug collides", async () => {
    fetchMock
      .mockImplementationOnce(async () => {
        throw new SupabaseError("duplicate key value violates unique constraint", 409, "23505");
      })
      .mockImplementationOnce(async (_url: string, init: RequestInit) => reply([JSON.parse(init.body as string)]));

    const post = await createPost({
      title: "How BSE Gainers Actually Work!",
      excerpt: "A short primer.",
      coverImageUrl: null,
      bodyMarkdown: "Body text here, twenty chars.",
      authorName: "StockersAI Team",
      createdBy: "user_admin",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(post.slug).toBe("how-bse-gainers-actually-work-2");
  });
});

describe("updatePost", () => {
  it("sends only the changed fields and bumps updated_at", async () => {
    fetchMock.mockResolvedValueOnce(reply([{ ...ROW, title: "New title" }]));

    const post = await updatePost("post_stored", { title: "New title" });

    const [call] = calls();
    expect(call.url).toContain("blog_posts?id=eq.post_stored");
    expect(call.body).toEqual(expect.objectContaining({ title: "New title" }));
    expect(call.body).toHaveProperty("updated_at");
    expect(post?.title).toBe("New title");
  });

  it("returns null for an unknown id", async () => {
    const post = await updatePost("post_missing", { title: "New title" });
    expect(post).toBeNull();
  });
});

describe("deletePost", () => {
  it("reports true when a row was removed", async () => {
    fetchMock.mockResolvedValueOnce(reply([ROW]));
    expect(await deletePost("post_stored")).toBe(true);
  });

  it("reports false when nothing matched", async () => {
    expect(await deletePost("post_missing")).toBe(false);
  });
});

describe("transitionBlogPost", () => {
  it("approves a draft, filtering the PATCH on the draft status", async () => {
    fetchMock.mockResolvedValueOnce(reply([{ ...ROW, status: "approved", approved_at: "2026-08-22T00:00:00.000Z" }]));

    const post = await transitionBlogPost("post_stored", "approve");

    const [call] = calls();
    expect(call.method).toBe("PATCH");
    expect(call.url).toContain("id=eq.post_stored");
    expect(call.url).toContain("status=eq.draft");
    expect(call.body?.status).toBe("approved");
    expect(call.body).toHaveProperty("approved_at");
    expect(post?.status).toBe("approved");
  });

  it("publishes an approved post and sets published_at", async () => {
    fetchMock.mockResolvedValueOnce(
      reply([{ ...ROW, status: "published", approved_at: "2026-08-22T00:00:00.000Z", published_at: "2026-08-23T00:00:00.000Z" }]),
    );

    await transitionBlogPost("post_stored", "publish");

    const [call] = calls();
    expect(call.url).toContain("status=eq.approved");
    expect(call.body?.status).toBe("published");
    expect(call.body).toHaveProperty("published_at");
  });

  it("clears published_at when unpublishing back to draft", async () => {
    fetchMock.mockResolvedValueOnce(reply([{ ...ROW, status: "draft", published_at: null }]));

    await transitionBlogPost("post_stored", "unpublish");

    const [call] = calls();
    expect(call.url).toContain("status=eq.published");
    expect(call.body?.status).toBe("draft");
    expect(call.body?.published_at).toBeNull();
  });

  it("returns null when the post is not in the state the action requires", async () => {
    // Zero rows come back because the WHERE clause (id + expected current status) matched nothing.
    const post = await transitionBlogPost("post_stored", "publish");
    expect(post).toBeNull();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test -- test/lib/blog.test.ts`
Expected: FAIL — `Cannot find module '../../app/lib/blog'`

- [ ] **Step 5: Implement `app/lib/blog.ts`**

```typescript
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- test/lib/blog.test.ts`
Expected: PASS, all suites green.

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql app/lib/blog-post.ts app/lib/blog.ts test/lib/blog.test.ts
git commit -m "feat: add blog_posts schema and Supabase-backed blog data layer"
```

---

### Task 2: Markdown rendering

**Files:**
- Create: `app/lib/blog-markdown.ts`
- Test: `test/lib/blog-markdown.test.ts`
- Modify: `package.json` (add `marked`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `renderPostHtml(markdown: string): string` (`app/lib/blog-markdown.ts`), used by Task 4's public post page.

- [ ] **Step 1: Install `marked`**

Run: `npm install marked`

This adds `marked` to `dependencies` in `package.json` and updates `package-lock.json`. No manual edit — let npm pick the current version.

- [ ] **Step 2: Write the failing test**

Create `test/lib/blog-markdown.test.ts`:

```typescript
import { renderPostHtml } from "../../app/lib/blog-markdown";

describe("renderPostHtml", () => {
  it("renders headings", () => {
    expect(renderPostHtml("# Hello")).toContain("<h1>Hello</h1>");
  });

  it("renders paragraphs and bold text", () => {
    const html = renderPostHtml("This is **bold** text.");
    expect(html).toContain("<p>This is <strong>bold</strong> text.</p>");
  });

  it("renders links", () => {
    const html = renderPostHtml("[StockersAI](https://stockersai.com)");
    expect(html).toContain('<a href="https://stockersai.com">StockersAI</a>');
  });

  it("renders lists", () => {
    const html = renderPostHtml("- one\n- two");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- test/lib/blog-markdown.test.ts`
Expected: FAIL — `Cannot find module '../../app/lib/blog-markdown'`

- [ ] **Step 4: Implement `app/lib/blog-markdown.ts`**

```typescript
import { marked } from "marked";

/**
 * Renders a post's Markdown body to HTML.
 *
 * No sanitization pass on the output — every author is an admin, and an admin already has strictly
 * more powerful levers elsewhere in the dashboard (raw log access, role changes, feature kill
 * switches) than anything a blog post body could do. See the design spec's decision log.
 */
export function renderPostHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- test/lib/blog-markdown.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app/lib/blog-markdown.ts test/lib/blog-markdown.test.ts
git commit -m "feat: render blog post Markdown to HTML with marked"
```

---

### Task 3: Admin API route

**Files:**
- Create: `app/api/admin/blog/route.ts`
- Test: `test/lib/admin-blog-route.test.ts`

**Interfaces:**
- Consumes: `listAllPosts`, `createPost`, `updatePost`, `deletePost`, `transitionBlogPost` from `app/lib/blog.ts`; `BLOG_TRANSITION_ACTIONS`, `BlogTransitionAction` from `app/lib/blog-post.ts`; `userFromRequest` from `app/lib/store.ts` (existing, unchanged); `logAuditEvent` from `app/lib/application-logger.ts` (existing, unchanged).
- Produces: `GET`, `POST`, `PATCH`, `DELETE` route handlers at `/api/admin/blog`, consumed by Task 5's `AdminBlog` component.

- [ ] **Step 1: Write the failing tests**

Create `test/lib/admin-blog-route.test.ts`:

```typescript
/** @jest-environment node */

// The admin gate is exercised against a mocked `userFromRequest` rather than a real session token,
// so this suite is independent of which backend the account store is using. The blog data itself
// goes through the real app/lib/blog.ts against a mocked `fetch`, exactly like test/lib/blog.test.ts.

jest.mock("../../app/lib/store", () => ({ userFromRequest: jest.fn() }));

import { DELETE, GET, PATCH, POST } from "../../app/api/admin/blog/route";
import { userFromRequest, type AppUser } from "../../app/lib/store";

const mockedUserFromRequest = userFromRequest as jest.MockedFunction<typeof userFromRequest>;

const URL_BASE = "https://project-under-test.supabase.co";

function reply(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Map(),
  } as unknown as Response;
}

let fetchMock: jest.Mock;

const admin: AppUser = {
  id: "user_admin",
  name: "Root Admin",
  email: "root@example.com",
  passwordHash: "salt:hash",
  plan: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  role: "admin",
};

const regular: AppUser = { ...admin, id: "user_regular", role: "user" };

const ROW = {
  id: "post_stored",
  title: "How BSE gainers actually work",
  slug: "how-bse-gainers-actually-work",
  excerpt: "A short primer.",
  cover_image_url: null,
  body_markdown: "Body text, twenty characters at least.",
  author_name: "StockersAI Team",
  status: "draft",
  created_at: "2026-08-20T00:00:00.000Z",
  updated_at: "2026-08-20T00:00:00.000Z",
  approved_at: null,
  published_at: null,
  created_by: "user_admin",
};

function request(method: string, body?: unknown) {
  return new Request("http://localhost/api/admin/blog", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.SUPABASE_URL = URL_BASE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-under-test";
  fetchMock = jest.fn(async () => reply([]));
  global.fetch = fetchMock as unknown as typeof fetch;
  mockedUserFromRequest.mockReset();
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("GET /api/admin/blog", () => {
  it("refuses a non-admin", async () => {
    mockedUserFromRequest.mockResolvedValue(regular);
    const response = await GET(request("GET"));
    expect(response.status).toBe(403);
  });

  it("lists every post for an admin", async () => {
    mockedUserFromRequest.mockResolvedValue(admin);
    fetchMock.mockResolvedValueOnce(reply([ROW]));

    const response = await GET(request("GET"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.posts).toHaveLength(1);
    expect(payload.posts[0].slug).toBe("how-bse-gainers-actually-work");
  });
});

describe("POST /api/admin/blog", () => {
  it("refuses a non-admin", async () => {
    mockedUserFromRequest.mockResolvedValue(regular);
    const response = await POST(request("POST", { title: "x" }));
    expect(response.status).toBe(403);
  });

  it("rejects a missing title", async () => {
    mockedUserFromRequest.mockResolvedValue(admin);
    const response = await POST(
      request("POST", { title: "", excerpt: "e", bodyMarkdown: "twenty characters minimum", authorName: "A" }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a body shorter than 20 characters", async () => {
    mockedUserFromRequest.mockResolvedValue(admin);
    const response = await POST(
      request("POST", { title: "Title", excerpt: "e", bodyMarkdown: "too short", authorName: "A" }),
    );
    expect(response.status).toBe(400);
  });

  it("creates a draft for a valid submission", async () => {
    mockedUserFromRequest.mockResolvedValue(admin);
    fetchMock
      .mockImplementationOnce(async (_url: string, init: RequestInit) => reply([JSON.parse(init.body as string)]))
      .mockResolvedValueOnce(reply([ROW]));

    const response = await POST(
      request("POST", {
        title: "How BSE gainers actually work",
        excerpt: "A short primer.",
        bodyMarkdown: "Body text, twenty characters at least.",
        authorName: "StockersAI Team",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.post.status).toBe("draft");
  });
});

describe("PATCH /api/admin/blog", () => {
  it("refuses a non-admin", async () => {
    mockedUserFromRequest.mockResolvedValue(regular);
    const response = await PATCH(request("PATCH", { id: "post_stored", action: "approve" }));
    expect(response.status).toBe(403);
  });

  it("rejects an unknown action", async () => {
    mockedUserFromRequest.mockResolvedValue(admin);
    const response = await PATCH(request("PATCH", { id: "post_stored", action: "nonsense" }));
    expect(response.status).toBe(400);
  });

  it("reports an illegal transition as a 400, not a 404", async () => {
    mockedUserFromRequest.mockResolvedValue(admin);
    // No row comes back from the mocked fetch — the WHERE clause matched nothing, which is what an
    // already-published post being asked to "approve" looks like.
    const response = await PATCH(request("PATCH", { id: "post_stored", action: "approve" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/not valid/i);
  });

  it("approves a draft and revalidates the public pages", async () => {
    mockedUserFromRequest.mockResolvedValue(admin);
    fetchMock
      .mockResolvedValueOnce(reply([{ ...ROW, status: "approved", approved_at: "2026-08-22T00:00:00.000Z" }]))
      .mockResolvedValueOnce(reply([ROW]));

    const response = await PATCH(request("PATCH", { id: "post_stored", action: "approve" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.post.status).toBe("approved");
  });

  it("edits content fields without an action", async () => {
    mockedUserFromRequest.mockResolvedValue(admin);
    fetchMock
      .mockResolvedValueOnce(reply([{ ...ROW, title: "New title" }]))
      .mockResolvedValueOnce(reply([ROW]));

    const response = await PATCH(request("PATCH", { id: "post_stored", title: "New title" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.post.title).toBe("New title");
  });

  it("rejects a PATCH with nothing to change", async () => {
    mockedUserFromRequest.mockResolvedValue(admin);
    const response = await PATCH(request("PATCH", { id: "post_stored" }));
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/admin/blog", () => {
  it("refuses a non-admin", async () => {
    mockedUserFromRequest.mockResolvedValue(regular);
    const response = await DELETE(request("DELETE", { id: "post_stored" }));
    expect(response.status).toBe(403);
  });

  it("deletes a post for an admin", async () => {
    mockedUserFromRequest.mockResolvedValue(admin);
    fetchMock.mockResolvedValueOnce(reply([ROW])).mockResolvedValueOnce(reply([]));

    const response = await DELETE(request("DELETE", { id: "post_stored" }));
    expect(response.status).toBe(200);
  });

  it("reports an unknown id as 404", async () => {
    mockedUserFromRequest.mockResolvedValue(admin);
    const response = await DELETE(request("DELETE", { id: "post_missing" }));
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/lib/admin-blog-route.test.ts`
Expected: FAIL — `Cannot find module '../../app/api/admin/blog/route'`

- [ ] **Step 3: Implement `app/api/admin/blog/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createPost, deletePost, listAllPosts, transitionBlogPost, updatePost, type BlogPostEdit } from "../../../lib/blog";
import { BLOG_TRANSITION_ACTIONS, type BlogTransitionAction } from "../../../lib/blog-post";
import { logAuditEvent } from "../../../lib/application-logger";
import { userFromRequest, type AppUser } from "../../../lib/store";

async function requireAdmin(request: Request): Promise<AppUser | null> {
  const user = await userFromRequest(request);
  return user && user.role === "admin" ? user : null;
}

const forbidden = () => NextResponse.json({ error: "Admin access required." }, { status: 403 });

function revalidatePublicPages(slug: string) {
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
}

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return forbidden();
  return NextResponse.json({ posts: await listAllPosts() });
}

type CreateBody = { title?: unknown; excerpt?: unknown; coverImageUrl?: unknown; bodyMarkdown?: unknown; authorName?: unknown };

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden();

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { title, excerpt, coverImageUrl, bodyMarkdown, authorName } = body;
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  if (typeof excerpt !== "string" || !excerpt.trim()) {
    return NextResponse.json({ error: "An excerpt is required." }, { status: 400 });
  }
  if (typeof bodyMarkdown !== "string" || bodyMarkdown.trim().length < 20) {
    return NextResponse.json({ error: "Post body must be at least 20 characters." }, { status: 400 });
  }
  if (typeof authorName !== "string" || !authorName.trim()) {
    return NextResponse.json({ error: "An author name is required." }, { status: 400 });
  }

  const post = await createPost({
    title: title.trim(),
    excerpt: excerpt.trim(),
    coverImageUrl: typeof coverImageUrl === "string" && coverImageUrl.trim() ? coverImageUrl.trim() : null,
    bodyMarkdown,
    authorName: authorName.trim(),
    createdBy: admin.id,
  });

  logAuditEvent({
    useCase: "Blog administration",
    operation: "blog.create",
    message: "Admin created a blog post draft.",
    userId: admin.id,
    statusCode: 200,
    path: new URL(request.url).pathname,
    method: request.method,
    metadata: { postId: post.id, slug: post.slug },
  });

  return NextResponse.json({ ok: true, post, posts: await listAllPosts() });
}

type PatchBody = {
  id?: unknown;
  action?: unknown;
  title?: unknown;
  excerpt?: unknown;
  coverImageUrl?: unknown;
  bodyMarkdown?: unknown;
  authorName?: unknown;
};

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden();

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { id, action } = body;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "A post id is required." }, { status: 400 });
  }

  if (typeof action === "string" && action) {
    if (!BLOG_TRANSITION_ACTIONS.includes(action as BlogTransitionAction)) {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const updated = await transitionBlogPost(id, action as BlogTransitionAction);
    if (!updated) {
      return NextResponse.json(
        { error: "That action is not valid for the post's current status, or the post doesn't exist." },
        { status: 400 },
      );
    }

    logAuditEvent({
      useCase: "Blog administration",
      operation: `blog.${action}`,
      message: `Admin ${action}d a blog post.`,
      userId: admin.id,
      statusCode: 200,
      path: new URL(request.url).pathname,
      method: request.method,
      metadata: { postId: updated.id, slug: updated.slug, status: updated.status },
    });

    revalidatePublicPages(updated.slug);
    return NextResponse.json({ ok: true, post: updated, posts: await listAllPosts() });
  }

  const { title, excerpt, coverImageUrl, bodyMarkdown, authorName } = body;
  const patch: BlogPostEdit = {};
  if (typeof title === "string" && title.trim()) patch.title = title.trim();
  if (typeof excerpt === "string" && excerpt.trim()) patch.excerpt = excerpt.trim();
  if (typeof coverImageUrl === "string") patch.coverImageUrl = coverImageUrl.trim() || null;
  if (typeof bodyMarkdown === "string" && bodyMarkdown.trim().length >= 20) patch.bodyMarkdown = bodyMarkdown;
  if (typeof authorName === "string" && authorName.trim()) patch.authorName = authorName.trim();

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const updated = await updatePost(id, patch);
  if (!updated) {
    return NextResponse.json({ error: "No such post." }, { status: 404 });
  }

  logAuditEvent({
    useCase: "Blog administration",
    operation: "blog.edit",
    message: "Admin edited a blog post.",
    userId: admin.id,
    statusCode: 200,
    path: new URL(request.url).pathname,
    method: request.method,
    metadata: { postId: updated.id, changedFields: Object.keys(patch) },
  });

  if (updated.status === "published") revalidatePublicPages(updated.slug);
  return NextResponse.json({ ok: true, post: updated, posts: await listAllPosts() });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden();

  let body: { id?: unknown };
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "A post id is required." }, { status: 400 });
  }

  const deleted = await deletePost(body.id);
  if (!deleted) {
    return NextResponse.json({ error: "No such post." }, { status: 404 });
  }

  logAuditEvent({
    useCase: "Blog administration",
    operation: "blog.delete",
    message: "Admin deleted a blog post.",
    userId: admin.id,
    statusCode: 200,
    path: new URL(request.url).pathname,
    method: request.method,
    metadata: { postId: body.id },
  });

  revalidatePath("/blog");
  return NextResponse.json({ ok: true, posts: await listAllPosts() });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/lib/admin-blog-route.test.ts`
Expected: PASS, all suites green.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/blog/route.ts test/lib/admin-blog-route.test.ts
git commit -m "feat: add the admin blog API route with create/approve/publish/reject/unpublish"
```

---

### Task 4: Public blog pages

**Files:**
- Create: `app/blog/page.tsx`
- Create: `app/blog/[slug]/page.tsx`
- Modify: `app/lib/seo.ts` (add `/blog` to `PUBLIC_ROUTES`)
- Modify: `app/sitemap.ts` (add a `/blog` entry)

**Interfaces:**
- Consumes: `listPublishedPosts`, `getPublishedPostBySlug` from `app/lib/blog.ts` (Task 1); `renderPostHtml` from `app/lib/blog-markdown.ts` (Task 2); `pageMetadata`, `absoluteUrl`, `SEO_IMAGE_PATH` from `app/lib/seo.ts` (existing).
- Produces: the `/blog` and `/blog/[slug]` routes, linked from Task 6's header nav.

This task has no new automated test of its own: the data-fetching functions it calls are already covered by `test/lib/blog.test.ts` (Task 1), and the Markdown rendering it uses is covered by `test/lib/blog-markdown.test.ts` (Task 2). Async Server Components with a `params: Promise<...>` signature aren't practical to unit-test with Jest + Testing Library in this codebase (no existing page under `app/` has such a test — every test here targets a `lib` function or a client component). This task is verified with the manual dev-server check in Step 5 instead.

- [ ] **Step 1: Add `/blog` to the public route list**

In `app/lib/seo.ts`, add `"/blog"` to the `PUBLIC_ROUTES` array (around line 56-57, after `"/pricing"` and before `"/news"`):

```typescript
export const PUBLIC_ROUTES = [
  "/",
  "/beat-the-ai",
  "/live-market",
  "/bse-gainers-losers",
  "/bse-sectors",
  "/shareholding",
  "/accuracy",
  "/pricing",
  "/blog",
  "/news",
  "/about",
  "/contact",
  "/privacy-policy",
  "/disclaimer",
  "/refund-policy",
  "/return-policy",
] as const;
```

- [ ] **Step 2: Write the blog index page**

Create `app/blog/page.tsx`:

```tsx
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
```

- [ ] **Step 3: Write the single post page**

Create `app/blog/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedPostBySlug } from "../../lib/blog";
import { renderPostHtml } from "../../lib/blog-markdown";
import { pageMetadata } from "../../lib/seo";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
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
  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();

  const html = renderPostHtml(post.bodyMarkdown);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 px-safe py-12 text-slate-700 transition-colors dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-300">
      <div className="gutter">
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
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Add the blog index to the sitemap**

In `app/sitemap.ts`, add a new entry to the returned array, right after the `/news` entry (after its closing `},` around line 60):

```typescript
    {
      url: absoluteUrl("/blog"),
      images: [siteImage],
      lastModified: built,
      changeFrequency: "weekly",
      priority: 0.7,
    },
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, then in a browser:
1. Visit `/blog` — it should render the "No posts published yet." empty state (no posts exist yet at this point in the plan).
2. Visit `/blog/anything` — it should 404.

This confirms the pages compile, route correctly, and the empty/not-found paths work before Task 5 wires up a way to actually create a post.

- [ ] **Step 6: Commit**

```bash
git add app/blog app/lib/seo.ts app/sitemap.ts
git commit -m "feat: add the public /blog listing and post pages"
```

---

### Task 5: Admin blog UI

**Files:**
- Create: `app/components/admin-blog.tsx`
- Create: `app/(admin)/posts/page.tsx`
- Modify: `app/components/super-admin-dashboard.tsx`
- Modify: `app/lib/section-routes.ts` (add `/posts` to `ADMIN_ROUTE_PATHS`)
- Test: `test/components/admin-blog.test.tsx`

**Interfaces:**
- Consumes: `authHeaders` from `app/components/subscription-provider.tsx` (existing, unchanged); the `/api/admin/blog` route from Task 3; `BlogPost`, `BlogPostStatus` from `app/lib/blog-post.ts` (Task 1) — imported as types only, since this is a client component and must not pull in `app/lib/blog.ts` (server-only).
- Produces: `AdminBlog` component, wired into `SuperAdminDashboard`'s `"blog"` tab at `/posts`.

- [ ] **Step 1: Write the failing tests**

Create `test/components/admin-blog.test.tsx`:

```typescript
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminBlog } from "../../app/components/admin-blog";

jest.mock("../../app/components/subscription-provider", () => ({
  authHeaders: () => ({ Authorization: "Bearer admin-token" }),
}));

const draftPost = {
  id: "post_1",
  title: "How BSE gainers actually work",
  slug: "how-bse-gainers-actually-work",
  excerpt: "A short primer.",
  coverImageUrl: null,
  bodyMarkdown: "Body text here, well over twenty characters.",
  authorName: "StockersAI Team",
  status: "draft",
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
  approvedAt: null,
  publishedAt: null,
  createdBy: "user_admin",
};

const approvedPost = { ...draftPost, id: "post_2", status: "approved", approvedAt: "2026-08-21T00:00:00.000Z" };
const publishedPost = { ...draftPost, id: "post_3", status: "published", publishedAt: "2026-08-22T00:00:00.000Z" };

function mockApi(...responses: { ok?: boolean; body: unknown }[]) {
  const fetchMock = jest.fn();
  for (const { ok = true, body } of responses) {
    fetchMock.mockResolvedValueOnce({ ok, json: async () => body });
  }
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("AdminBlog", () => {
  it("says so while posts are loading", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<AdminBlog />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("lists posts with their status", async () => {
    mockApi({ body: { posts: [draftPost, approvedPost, publishedPost] } });
    render(<AdminBlog />);

    expect(await screen.findByText("How BSE gainers actually work")).toBeInTheDocument();
    expect(screen.getAllByText("How BSE gainers actually work")).toHaveLength(3);
    expect(screen.getByText("draft")).toBeInTheDocument();
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
  });

  it("shows only the Approve action for a draft", async () => {
    mockApi({ body: { posts: [draftPost] } });
    render(<AdminBlog />);
    await screen.findByText("draft");

    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unpublish" })).not.toBeInTheDocument();
  });

  it("shows Publish and Reject for an approved post", async () => {
    mockApi({ body: { posts: [approvedPost] } });
    render(<AdminBlog />);
    await screen.findByText("approved");

    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("shows only Unpublish for a published post", async () => {
    mockApi({ body: { posts: [publishedPost] } });
    render(<AdminBlog />);
    await screen.findByText("published");

    expect(screen.getByRole("button", { name: "Unpublish" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
  });

  it("creates a draft from the form", async () => {
    const user = userEvent.setup();
    const api = mockApi({ body: { posts: [] } }, { body: { post: draftPost, posts: [draftPost] } });
    render(<AdminBlog />);
    await screen.findByText(/No posts yet/);

    await user.type(screen.getByLabelText(/Title/), "How BSE gainers actually work");
    await user.type(screen.getByLabelText(/Excerpt/), "A short primer.");
    await user.type(screen.getByLabelText(/Author name/), "StockersAI Team");
    await user.type(screen.getByLabelText(/Body \(Markdown\)/), "Body text here, well over twenty characters.");
    await user.click(screen.getByRole("button", { name: "Create draft" }));

    expect(await screen.findByText("How BSE gainers actually work")).toBeInTheDocument();
    const [, init] = api.mock.calls[1];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(
      expect.objectContaining({ title: "How BSE gainers actually work", authorName: "StockersAI Team" }),
    );
  });

  it("approves a draft", async () => {
    const user = userEvent.setup();
    const api = mockApi({ body: { posts: [draftPost] } }, { body: { post: approvedPost, posts: [approvedPost] } });
    render(<AdminBlog />);
    await screen.findByText("draft");

    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByText("approved")).toBeInTheDocument();
    const [, init] = api.mock.calls[1];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ id: "post_1", action: "approve" });
  });

  it("publishes an approved post", async () => {
    const user = userEvent.setup();
    mockApi({ body: { posts: [approvedPost] } }, { body: { post: publishedPost, posts: [publishedPost] } });
    render(<AdminBlog />);
    await screen.findByText("approved");

    await user.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByText("published")).toBeInTheDocument();
  });

  it("deletes a post", async () => {
    const user = userEvent.setup();
    const api = mockApi({ body: { posts: [draftPost] } }, { body: { posts: [] } });
    render(<AdminBlog />);
    await screen.findByText("draft");

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("draft")).not.toBeInTheDocument());
    const [, init] = api.mock.calls[1];
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({ id: "post_1" });
  });

  it("surfaces the service's own error for a failed create", async () => {
    const user = userEvent.setup();
    mockApi({ body: { posts: [] } }, { ok: false, body: { error: "A title is required." } });
    render(<AdminBlog />);
    await screen.findByText(/No posts yet/);

    await user.type(screen.getByLabelText(/Excerpt/), "A short primer.");
    await user.type(screen.getByLabelText(/Author name/), "StockersAI Team");
    await user.type(screen.getByLabelText(/Body \(Markdown\)/), "Body text here, well over twenty characters.");
    fireEvent.submit(screen.getByRole("button", { name: "Create draft" }).closest("form") as HTMLFormElement);

    expect(await screen.findByText("A title is required.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/components/admin-blog.test.tsx`
Expected: FAIL — `Cannot find module '../../app/components/admin-blog'`

- [ ] **Step 3: Implement `app/components/admin-blog.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BlogPost, BlogPostStatus, BlogTransitionAction } from "../lib/blog-post";
import { authHeaders } from "./subscription-provider";

const STATUS_STYLE: Record<BlogPostStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  approved: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
};

const ACTIONS_FOR_STATUS: Record<BlogPostStatus, { action: BlogTransitionAction; label: string }[]> = {
  draft: [{ action: "approve", label: "Approve" }],
  approved: [
    { action: "publish", label: "Publish" },
    { action: "reject", label: "Reject" },
  ],
  published: [{ action: "unpublish", label: "Unpublish" }],
};

function inputClassName() {
  return "mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900 outline-none ring-emerald-500 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white";
}

export function AdminBlog() {
  const formRef = useRef<HTMLFormElement>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/admin/blog", { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Could not load blog posts.");
        return;
      }
      setPosts(data.posts ?? []);
    } catch {
      setError("Could not reach the blog service.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; state updates happen after the async request resolves.
    load();
  }, [load]);

  const submitDraft = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/admin/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          title: form.get("title"),
          excerpt: form.get("excerpt"),
          coverImageUrl: form.get("coverImageUrl"),
          bodyMarkdown: form.get("bodyMarkdown"),
          authorName: form.get("authorName"),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Could not create the blog post.");
        return;
      }
      setPosts(data.posts ?? []);
      formRef.current?.reset();
      setMessage("Draft created.");
    } catch {
      setError("Could not reach the blog service.");
    } finally {
      setBusy(false);
    }
  };

  const transition = async (post: BlogPost, action: BlogTransitionAction) => {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/blog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ id: post.id, action }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Could not update the post.");
        return;
      }
      setPosts(data.posts ?? []);
    } catch {
      setError("Could not reach the blog service.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (post: BlogPost) => {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/blog", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ id: post.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Could not delete the post.");
        return;
      }
      setPosts(data.posts ?? []);
      setMessage("Post deleted.");
    } catch {
      setError("Could not reach the blog service.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading blog posts...</p>;

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <form ref={formRef} onSubmit={submitDraft} className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Write a post</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Saves as a draft. Approve, then publish it from the list once it's ready for the blog.
        </p>

        <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Title
          <input name="title" required className={inputClassName()} />
        </label>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Excerpt
          <input name="excerpt" required className={inputClassName()} />
        </label>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Author name
          <input name="authorName" required className={inputClassName()} />
        </label>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Cover image URL (optional)
          <input name="coverImageUrl" type="url" placeholder="https://..." className={inputClassName()} />
        </label>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Body (Markdown)
          <textarea name="bodyMarkdown" required rows={10} className={inputClassName()} />
        </label>

        {error && (
          <p className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            {message}
          </p>
        )}

        <button type="submit" disabled={busy} className="mt-5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
          {busy ? "Saving..." : "Create draft"}
        </button>
      </form>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Posts</h2>
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {posts.length} total
          </span>
        </div>

        {posts.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No posts yet. Write one on the left.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {posts.map((post) => (
              <div key={post.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white">{post.title}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{post.authorName} · /blog/{post.slug}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[post.status]}`}>{post.status}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{post.excerpt}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ACTIONS_FOR_STATUS[post.status].map(({ action, label }) => (
                    <button
                      key={action}
                      type="button"
                      disabled={busy}
                      onClick={() => transition(post, action)}
                      className="rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-400 disabled:opacity-50 dark:border-emerald-500/30 dark:text-emerald-300"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(post)}
                    className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-400 disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/components/admin-blog.test.tsx`
Expected: PASS, all suites green.

- [ ] **Step 5: Add `/posts` to the admin route table**

In `app/lib/section-routes.ts`, add `"/posts"` to `ADMIN_ROUTE_PATHS` (after `"/reviews"`, around line 285):

```typescript
export const ADMIN_ROUTE_PATHS = [
  "/console",
  "/analytics",
  "/ai",
  "/hackers",
  "/platform-logs",
  "/application-performance-logs",
  "/logs",
  "/users",
  "/subscriptions",
  "/reviews",
  "/posts",
  "/features",
  "/cache",
  "/application",
] as const;
```

- [ ] **Step 6: Wire the new tab into `SuperAdminDashboard`**

In `app/components/super-admin-dashboard.tsx`:

1. Add the import, next to the other admin panel imports (around line 16):

```typescript
import { AdminBlog } from "./admin-blog";
```

2. Add `"blog"` to the `SuperAdminSectionId` union (around line 38, after `"reviews"`):

```typescript
export type SuperAdminSectionId =
  | "overview"
  | "analytics"
  | "ai"
  | "hackers"
  | "logs"
  | "live"
  | "users"
  | "subscriptions"
  | "reviews"
  | "blog"
  | "features"
  | "cache"
  | "application";
```

3. Add a `BlogIcon` function, next to `ReviewsIcon` (around line 159, right after `ReviewsIcon`'s closing brace):

```typescript
function BlogIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M9 12h6M9 16h6M9 8h3" />
    </svg>
  );
}
```

4. Add the nav entry, right after the `"reviews"` entry (around line 285, after its closing `},`):

```typescript
  {
    id: "blog",
    label: "Blog Posts",
    description: "Write, approve and publish posts for the public blog.",
    href: "/posts",
    icon: BlogIcon,
  },
```

5. Add the switch case, right after the `"reviews"` case (around line 1413, after its closing `);`):

```typescript
    case "blog":
      return (
        <AdminAccessGate>
          <AdminBlog />
        </AdminAccessGate>
      );
```

- [ ] **Step 7: Create the admin page**

Create `app/(admin)/posts/page.tsx`:

```tsx
import type { Metadata } from "next";
import { SuperAdminDashboard } from "../../components/super-admin-dashboard";

export const metadata: Metadata = {
  title: "Blog Posts | Super Admin | Stockers",
  description: "Write, approve and publish posts for the StockersAI blog.",
  robots: { index: false, follow: false },
};

export default function AdminBlogPage() {
  return <SuperAdminDashboard active="blog" />;
}
```

- [ ] **Step 8: Run the full test suite to check nothing else broke**

Run: `npm test`
Expected: PASS, including `test/lib/route-collisions.test.ts` (which now also checks `/posts` has a real folder behind it and that `app/(admin)/posts/page.tsx` renders `SuperAdminDashboard`).

- [ ] **Step 9: Commit**

```bash
git add app/components/admin-blog.tsx app/components/super-admin-dashboard.tsx app/lib/section-routes.ts "app/(admin)/posts/page.tsx" test/components/admin-blog.test.tsx
git commit -m "feat: add the Blog Posts admin tab at /posts"
```

---

### Task 6: Header nav link and hiding Client reviews

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: nothing new — this only edits the existing `navLinks` construction and `LandingStack` in `app/page.tsx`.
- Produces: nothing consumed by a later task — this is the last task in the plan.

There is no existing automated test that renders `app/page.tsx` (no test file imports it — it's a large server component tree with a full page of live-data dependencies, and every other test in this codebase targets a `lib` function or an isolated component instead). This task is verified manually in Step 3, consistent with that.

- [ ] **Step 1: Add the Blog link to the header nav**

In `app/page.tsx`, find the `navLinks` construction (around line 67-70):

```typescript
const navLinks = visitorNavOrder.flatMap((id) => {
  const route = homeSectionById.get(id);
  return route ? [{ href: route.path, label: route.label }] : [];
});
```

Replace it with:

```typescript
const navLinks = [
  ...visitorNavOrder.flatMap((id) => {
    const route = homeSectionById.get(id);
    return route ? [{ href: route.path, label: route.label }] : [];
  }),
  { href: "/blog", label: "Blog" },
];
```

`/blog` isn't one of the anchor sections `SectionPageStack` renders inline on the landing page — it's a standalone page — so it's appended directly rather than routed through `HOME_SECTION_ROUTES`/`visitorNavOrder`. `MobileNav` already takes a plain `{ href, label }[]`, so it picks this up with no further change.

- [ ] **Step 2: Hide the Client reviews section**

In `app/page.tsx`, in `LandingStack` (around line 226-227), remove the section and its now-stale comment:

Before:
```tsx
      {/* Last thing before the footer: the boards make the case, the reviews close it. */}
      <StreamedClientReviews />

      <SiteFooter />
```

After:
```tsx
      <SiteFooter />
```

Then remove the now-unused import (around line 17):

```typescript
import { StreamedClientReviews } from "./components/streamed-client-reviews";
```

Leave `app/components/streamed-client-reviews.tsx`, `app/api/admin/client-reviews/route.ts`, `app/lib/client-reviews.ts`, `app/data/client-reviews.json` and the admin Reviews tab exactly as they are — this hides the section from the landing page, it doesn't remove the feature.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, then in a browser at `/`:
1. Confirm the header nav (desktop and the mobile menu) now shows a "Blog" link that goes to `/blog`.
2. Scroll the landing page and confirm the Client reviews carousel no longer appears between the AI features section and the footer.
3. Visit `/reviews` in the admin dashboard (as an admin) and confirm the Client Reviews tab still works — it's unaffected, only hidden from the landing page.

- [ ] **Step 4: Run the full test suite one more time**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add Blog to the header nav and hide the landing page's client reviews section"
```

---

## Post-plan note: applying the schema

Task 1 adds `blog_posts` to `supabase/schema.sql` but does not apply it to any live Supabase project — this repo's schema file is meant to be pasted into the Supabase SQL editor by hand (see the file's own header comment), the same way every other table in it was added. Before the blog admin panel can actually create a post against a real deployment, `supabase/schema.sql` needs to be re-run in that project's SQL editor. It is safe to re-run in full at any time — every statement is `create table if not exists` / `create index if not exists`.
