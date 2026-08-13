import { render, waitFor } from "@testing-library/react";
import { VisitTracker, alreadySent, visitorId } from "../../app/components/visit-tracker";

let pathname = "/";

jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

/** The body of the single ping the tracker sent. */
function sentBody(): Record<string, unknown> {
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  return JSON.parse(init.body as string);
}

beforeEach(() => {
  pathname = "/";
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.cookie = "stockers_visitor=; path=/; max-age=0";
  global.fetch = jest.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
});

describe("visitorId", () => {
  it("mints an id in the shape the server accepts, and keeps it", () => {
    const first = visitorId();

    expect(first).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(visitorId()).toBe(first);
    expect(window.localStorage.getItem("stockers-visitor")).toBe(first);
  });

  it("mirrors the id into a cookie, so the server can attribute a signed-out visitor", () => {
    const id = visitorId();

    expect(document.cookie).toContain(`stockers_visitor=${id}`);
  });

  it("replaces a stored value that is not one of ours", () => {
    window.localStorage.setItem("stockers-visitor", "nope");

    expect(visitorId()).not.toBe("nope");
  });

  it("gives up quietly when storage is unavailable", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("private mode");
    });

    expect(visitorId()).toBeNull();
  });
});

describe("alreadySent", () => {
  it("is false the first time and true afterwards", () => {
    expect(alreadySent("/news")).toBe(false);
    expect(alreadySent("/news")).toBe(true);
    expect(alreadySent("/about")).toBe(false);
  });

  it("reports not-sent when the session store cannot be read", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("private mode");
    });

    expect(alreadySent("/news")).toBe(false);
  });
});

describe("VisitTracker", () => {
  it("renders nothing", () => {
    const { container } = render(<VisitTracker />);

    expect(container).toBeEmptyDOMElement();
  });

  it("reports the page, the referring URL and the visitor id", async () => {
    pathname = "/news";
    Object.defineProperty(document, "referrer", { value: "https://news.example.com/story", configurable: true });

    render(<VisitTracker />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/analytics/track", expect.objectContaining({ method: "POST" })));
    expect(sentBody()).toMatchObject({
      path: "/news",
      referrer: "https://news.example.com/story",
      visitorId: window.localStorage.getItem("stockers-visitor"),
    });
  });

  it("reports a page once per tab, however often it is mounted", async () => {
    render(<VisitTracker />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    render(<VisitTracker />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not count the admin's own tour of the dashboard as site traffic", async () => {
    pathname = "/admin/analytics";

    render(<VisitTracker />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("stays silent when the endpoint cannot be reached", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    render(<VisitTracker />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });
});
