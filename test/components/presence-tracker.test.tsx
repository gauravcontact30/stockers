// The heartbeat that makes "who is on the site right now" answerable.
//
// Three properties matter here and nothing else does. It must repeat while nothing is happening —
// that is the entire reason it exists, since a page view is reported once and then folded away for
// half an hour. It must stop while nobody is looking, or a tab left open overnight becomes a
// visitor who never leaves. And it must never be able to break the page it is reporting on.

import { act, render } from "@testing-library/react";
import { PresenceTracker } from "../../app/components/presence-tracker";

let pathname = "/";

jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

/** The body of the nth heartbeat. */
function sentBody(index = 0): Record<string, unknown> {
  const [, init] = (global.fetch as jest.Mock).mock.calls[index];
  return JSON.parse((init as RequestInit).body as string);
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

beforeEach(() => {
  jest.useFakeTimers();
  pathname = "/";
  setVisibility("visible");
  window.localStorage.clear();
  window.sessionStorage.clear();
  global.fetch = jest.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("PresenceTracker", () => {
  it("renders nothing", () => {
    const { container } = render(<PresenceTracker />);

    expect(container).toBeEmptyDOMElement();
  });

  it("reports straight away rather than leaving the first minute unaccounted for", () => {
    render(<PresenceTracker />);

    expect(global.fetch).toHaveBeenCalledWith("/api/analytics/presence", expect.objectContaining({ method: "POST" }));
  });

  it("says where the reader is, and who the browser and tab are", () => {
    pathname = "/news";
    render(<PresenceTracker />);

    const body = sentBody();
    expect(body.path).toBe("/news");
    // Both ids are in the shape the server accepts; neither identifies anybody.
    expect(body.visitorId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(body.sessionId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it("keeps beating while nothing at all happens", () => {
    render(<PresenceTracker />);

    act(() => {
      jest.advanceTimersByTime(180_000);
    });

    // Three minutes of a reader sitting still on one page. A visit event would have been folded
    // away after the first one, which is exactly why presence cannot be read off the event log.
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it("keeps calling itself the same browser and tab on every beat", () => {
    render(<PresenceTracker />);

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(sentBody(1).visitorId).toBe(sentBody(0).visitorId);
    expect(sentBody(1).sessionId).toBe(sentBody(0).sessionId);
  });

  it("goes quiet while the tab is in the background", () => {
    render(<PresenceTracker />);
    (global.fetch as jest.Mock).mockClear();

    setVisibility("hidden");
    act(() => {
      jest.advanceTimersByTime(300_000);
    });

    // Five minutes backgrounded and not one beat: a tab nobody is looking at is not a person using
    // the site, and counting one would make the headline figure meaningless.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("reports again the moment the reader comes back", () => {
    render(<PresenceTracker />);
    (global.fetch as jest.Mock).mockClear();

    setVisibility("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      jest.advanceTimersByTime(30_000);
    });
    expect(global.fetch).not.toHaveBeenCalled();

    setVisibility("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Straight away rather than at the next tick — otherwise somebody who has just returned is
    // missing from the list for up to a minute.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not count the admin's own tour of the dashboard as somebody using the site", () => {
    pathname = "/analytics";

    render(<PresenceTracker />);
    act(() => {
      jest.advanceTimersByTime(300_000);
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("stops when the page it was mounted on goes away", () => {
    const { unmount } = render(<PresenceTracker />);
    (global.fetch as jest.Mock).mockClear();

    unmount();
    act(() => {
      jest.advanceTimersByTime(300_000);
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("stays silent when the endpoint cannot be reached", () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    expect(() => render(<PresenceTracker />)).not.toThrow();
  });

  it("survives a browser with no fetch at all", () => {
    global.fetch = (() => {
      throw new Error("no fetch here");
    }) as unknown as typeof fetch;

    // Counting a reader is never worth taking the page they came for down with it.
    expect(() => render(<PresenceTracker />)).not.toThrow();
  });
});
