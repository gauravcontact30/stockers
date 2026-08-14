// The one-minute refresh behind the live exchange section.
//
// The behaviour worth pinning is not "it calls refresh" but when it stops: a hidden tab polling the
// exchange for hours is work nobody is looking at, and a timer left running after unmount is a
// refresh fired at a component that is gone.

import { render } from "@testing-library/react";
import { act } from "react";
import { MarketRefresher } from "../../app/components/market-refresher";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

/** Drives `document.visibilityState`, which is read-only otherwise. */
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  refresh.mockClear();
  setVisibility("visible");
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("MarketRefresher", () => {
  it("renders nothing — it is behaviour, not chrome", () => {
    const { container } = render(<MarketRefresher />);
    expect(container).toBeEmptyDOMElement();
  });

  it("refreshes on the interval it was given", () => {
    render(<MarketRefresher intervalMs={60_000} />);
    expect(refresh).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(120_000);
    });
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("stops while the tab is hidden and catches up when it comes back", () => {
    render(<MarketRefresher intervalMs={60_000} />);

    setVisibility("hidden");
    act(() => {
      jest.advanceTimersByTime(300_000);
    });
    // Five minutes in the background and not one request.
    expect(refresh).not.toHaveBeenCalled();

    // Coming back is the moment the figures are most likely stale, so it refreshes at once rather
    // than waiting out another full minute.
    setVisibility("visible");
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not start at all if it mounts into a hidden tab", () => {
    setVisibility("hidden");
    render(<MarketRefresher intervalMs={60_000} />);

    act(() => {
      jest.advanceTimersByTime(180_000);
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stops refreshing once it is gone", () => {
    const { unmount } = render(<MarketRefresher intervalMs={60_000} />);
    unmount();

    act(() => {
      jest.advanceTimersByTime(180_000);
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
