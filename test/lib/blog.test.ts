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
      .mockResolvedValueOnce(reply({ message: "duplicate key value violates unique constraint", code: "23505" }, 409))
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
