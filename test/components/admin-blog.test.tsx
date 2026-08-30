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

    // All three posts share the same title (approvedPost and publishedPost spread draftPost), so a
    // singular findByText/getByText would throw on the multiple matches by design — findAllByText
    // is what actually waits for the async load while also allowing the expected duplicate count.
    expect(await screen.findAllByText("How BSE gainers actually work")).toHaveLength(3);
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
