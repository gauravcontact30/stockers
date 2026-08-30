/** @jest-environment node */

// The admin gate is exercised against a mocked `userFromRequest` rather than a real session token,
// so this suite is independent of which backend the account store is using. The blog data itself
// goes through the real app/lib/blog.ts against a mocked `fetch`, exactly like test/lib/blog.test.ts.

jest.mock("../../app/lib/store", () => ({ userFromRequest: jest.fn() }));

// The Data Cache is Next's, not this application's, and it needs a request store no route test has
// one of — see test/lib/cache-routes.test.ts, which stubs the same function for the same reason.
// Standing in for it here keeps the assertions on the route's own response, not on Next's internal
// invariant that revalidatePath only runs inside a real request.
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

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
