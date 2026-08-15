import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorBoundary from "../../app/error";
import GlobalError from "../../app/global-error";

const error = () => Object.assign(new Error("upstream refused"), { digest: "a1b2c3d4" });

beforeEach(() => {
  // The boundary logs on mount, deliberately — see the component. Silenced so a passing run is not
  // full of red, but asserted on below rather than merely suppressed.
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("the route error boundary", () => {
  it("says which layer failed, without blaming the reader", () => {
    render(<ErrorBoundary error={error()} reset={jest.fn()} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This section could not be loaded");
    expect(screen.getByText(/market data feed refusing a request/)).toBeInTheDocument();
  });

  /**
   * In production React strips the message and leaves only the digest, which is the sole handle
   * tying what the reader saw to the server log. Logging it is what makes an "it broke" report
   * answerable at all.
   */
  it("logs the digest so the failure can be found in the server log", () => {
    render(<ErrorBoundary error={error()} reset={jest.fn()} />);

    expect(console.error).toHaveBeenCalledWith("Route error", "a1b2c3d4", expect.any(Error));
  });

  it("shows the reference to the reader, since it is all they can usefully quote", () => {
    render(<ErrorBoundary error={error()} reset={jest.fn()} />);

    expect(screen.getByText(/Reference: a1b2c3d4/)).toBeInTheDocument();
  });

  it("omits the reference block when there is no digest to show", () => {
    render(<ErrorBoundary error={new Error("local failure")} reset={jest.fn()} />);

    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
  });

  // The point of the boundary: retrying re-renders the failed subtree rather than reloading.
  it("retries through reset rather than a full page load", async () => {
    const reset = jest.fn();
    render(<ErrorBoundary error={error()} reset={reset} />);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("offers a way out as well as a way to retry", () => {
    render(<ErrorBoundary error={error()} reset={jest.fn()} />);

    expect(screen.getByRole("link", { name: "Back to the market" })).toHaveAttribute("href", "/");
  });
});

describe("the global error boundary", () => {
  /**
   * This one replaces the root layout rather than rendering inside it, so the stylesheet, the
   * fonts and the theme script are all part of what failed. Everything it draws therefore has to
   * be self-contained, which in practice means inline styles rather than Tailwind classes — a
   * class here would resolve to nothing and leave the reader an unstyled wall of text.
   */
  it("styles itself inline, since the stylesheet is part of what failed", () => {
    render(<GlobalError error={error()} reset={jest.fn()} />);

    const panel = screen.getByRole("main");
    expect(panel).toHaveAttribute("style");
    expect(panel.className).toBe("");

    // The retry control too — it is the one thing the reader is asked to click.
    expect(screen.getByRole("button", { name: "Try again" })).toHaveAttribute("style");
  });

  it("states the failure and shows the reference", () => {
    render(<GlobalError error={error()} reset={jest.fn()} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("StockersAI could not start");
    expect(screen.getByText(/Reference: a1b2c3d4/)).toBeInTheDocument();
  });

  it("retries through reset", async () => {
    const reset = jest.fn();
    render(<GlobalError error={error()} reset={reset} />);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  /**
   * A plain anchor rather than `next/link`: the router is part of what may have failed, so the way
   * home must not depend on it.
   */
  it("links home with a plain anchor, not the router", () => {
    render(<GlobalError error={error()} reset={jest.fn()} />);

    const home = screen.getByRole("link", { name: "Back to the market" });
    expect(home).toHaveAttribute("href", "/");
  });

  it("omits the reference block when there is no digest", () => {
    render(<GlobalError error={new Error("boot failure")} reset={jest.fn()} />);

    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
  });
});
