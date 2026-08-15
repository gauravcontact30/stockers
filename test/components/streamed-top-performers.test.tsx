import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import {
  StreamedTopPerformers,
  TopPerformersFallback,
  TopPerformersPayload,
} from "../../app/components/streamed-top-performers";

jest.mock("../../app/lib/top-performers", () => ({
  getTopPerformers: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the mocked module, for arranging return values.
const topPerformers = require("../../app/lib/top-performers") as { getTopPerformers: jest.Mock };

const board = {
  stocks: [
    {
      symbol: "CGPOWER",
      name: "CG Power and Industrial Solutions",
      sector: "Capital Goods",
      capTier: "Large",
      price: 742.15,
      changePercent: 1.8,
      periodReturn: 218.4,
    },
  ],
  total: 1,
  page: 1,
  pages: 1,
  pageSize: 5,
  period: "1y",
  direction: "gainers",
  threshold: 50,
  asOfDate: "2026-08-07",
  generatedAt: "2026-08-07T10:00:00.000Z",
  source: "Yahoo Finance (unofficial public feed)",
};

beforeEach(() => {
  topPerformers.getTopPerformers.mockResolvedValue(board);
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});

describe("TopPerformersFallback", () => {
  it("holds the board's chrome so the streamed-in rows don't shift the page", () => {
    const { container } = render(<TopPerformersFallback />);

    // The controls bar plus five skeleton rows.
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(6);
  });
});

describe("TopPerformersPayload", () => {
  it("asks the ranking for the view the board opens on", async () => {
    await TopPerformersPayload();

    expect(topPerformers.getTopPerformers).toHaveBeenCalledWith({
      direction: "gainers",
      period: "1y",
      page: 1,
      pageSize: 5,
    });
  });

  /**
   * This board keys its state by the controls it answers rather than by a URL, so the contract
   * between the two halves is the `key` string. It has to be built exactly the way the component
   * builds it — `direction|period|term|page` — or the seed is ignored and the prefetch buys nothing.
   */
  it("labels the payload with the control key the board computes on its first render", async () => {
    const element = await TopPerformersPayload();

    expect(element.props.prefetched.key).toBe("gainers|1y||1");
    expect(element.props.prefetched.stocks).toBe(board.stocks);
    expect(element.props.prefetched.asOf).toBe("2026-08-07");
    expect(element.props.prefetched.failed).toBe(false);
  });

  it("renders the rows straight out of the server's payload, without fetching", async () => {
    render(await TopPerformersPayload());

    expect(await screen.findByText("CGPOWER")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("the streamed boundary", () => {
  it("puts the board behind its own boundary, with its chrome as the fallback", () => {
    const element = StreamedTopPerformers();

    expect(element.type).toBe(Suspense);
    expect(element.props.children.type).toBe(TopPerformersPayload);

    const { container } = render(element.props.fallback);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(6);
  });
});
