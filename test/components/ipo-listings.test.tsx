import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  IpoListings,
  formatBand,
  formatDate,
  formatIssueSize,
  formatTimes,
  ipoBrief,
  subscriptionWidth,
} from "../../app/components/ipo-listings";

function mockListFetch(response: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({ ok, json: async () => response } as Response);
}

const ipos = [
  {
    id: "ARDEE",
    symbol: "ARDEE",
    company: "Ardee Industries Limited",
    board: "Mainboard" as const,
    status: "open" as const,
    openDate: "2026-08-05",
    closeDate: "2026-08-07",
    listingDate: "2026-08-12",
    priceBand: "Rs.50 to Rs.53",
    priceBandMin: 50,
    priceBandMax: 53,
    lotSize: 280,
    issueSizeCr: 309.64,
    subscription: {
      overall: 2.5136,
      categories: [
        { label: "Qualified Institutional Buyers(QIBs)", times: 1.0954, offered: 16435297, bid: 18003670 },
        { label: "Retail Individual Investors(RIIs)", times: 2.5247, offered: 29391053, bid: 74204794 },
      ],
    },
  },
  {
    id: "LEAP",
    symbol: "LEAP",
    company: "Leap India Limited",
    board: "SME" as const,
    status: "upcoming" as const,
    openDate: "2026-08-07",
    closeDate: "2026-08-11",
    listingDate: null,
    priceBand: "Rs.151 to Rs.159",
    priceBandMin: 151,
    priceBandMax: 159,
    lotSize: null,
    issueSizeCr: null,
    subscription: null,
  },
  {
    id: "JNPR",
    symbol: "JNPR",
    company: "Juniper Green Energy Limited",
    board: "Mainboard" as const,
    status: "closed" as const,
    openDate: "2026-07-30",
    closeDate: "2026-08-03",
    listingDate: null,
    priceBand: "Rs.214 to Rs.225",
    priceBandMin: 214,
    priceBandMax: 225,
    lotSize: null,
    issueSizeCr: null,
    subscription: null,
  },
];

const anticipated = [
  {
    company: "Delta Logistics",
    sector: "Ports & Logistics",
    note: "Filed DRHP privately; expected to launch next quarter.",
    logo: "https://logo.test/delta.png",
  },
];

const feed = {
  ipos,
  anticipated: [],
  counts: { open: 1, upcoming: 1, closed: 1 },
  today: "2026-08-05",
  live: true,
  source: "Live IPO calendar and subscription figures from NSE India",
};

describe("IPO formatters", () => {
  it("formats a price band, collapsing a fixed price to one value", () => {
    expect(formatBand(50, 53)).toBe("₹50 – ₹53");
    expect(formatBand(50, 50)).toBe("₹50");
    expect(formatBand(null, 53)).toBe("—");
    expect(formatBand(50, null)).toBe("—");
  });

  it("formats an issue size in whole crore", () => {
    expect(formatIssueSize(309.64)).toBe("₹310 Cr");
    expect(formatIssueSize(null)).toBe("—");
  });

  it("formats subscription as a multiple", () => {
    expect(formatTimes(2.5136)).toBe("2.51x");
    expect(formatTimes(null)).toBe("—");
  });

  it("formats a date, and refuses an unparseable one", () => {
    expect(formatDate("2026-08-07")).toBe("7 Aug 2026");
    expect(formatDate(null)).toBe("—");
    expect(formatDate("nonsense")).toBe("—");
  });

  // 1x fills a third of the bar so a heavily oversubscribed issue still has somewhere to grow.
  it("scales the subscription meter with headroom above 1x", () => {
    expect(subscriptionWidth(3)).toBe(100);
    expect(subscriptionWidth(1.5)).toBe(50);
    expect(subscriptionWidth(10)).toBe(100);
    expect(subscriptionWidth(0)).toBe(0);
    expect(subscriptionWidth(null)).toBe(0);
  });
});

describe("IpoListings", () => {
  it("shows loading skeletons before data arrives", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(<IpoListings />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
    expect(screen.getByText("As of … IST")).toBeInTheDocument();
  });

  it("renders OPEN, UPCOMING and CLOSED issues with their full details", async () => {
    mockListFetch(feed);
    render(<IpoListings />);

    expect(await screen.findByText("Ardee Industries Limited")).toBeInTheDocument();
    expect(screen.getByText("As of 2026-08-05 IST")).toBeInTheDocument();
    expect(screen.getByText(/Live IPO calendar and subscription figures from NSE India/)).toBeInTheDocument();

    expect(screen.getByText("OPEN")).toBeInTheDocument();
    expect(screen.getByText("UPCOMING")).toBeInTheDocument();
    expect(screen.getByText("CLOSED")).toBeInTheDocument();

    const ardee = screen.getByText("Ardee Industries Limited").closest("article")!;
    expect(within(ardee).getByText("ARDEE · Mainboard")).toBeInTheDocument();
    expect(within(ardee).getByText("₹50 – ₹53")).toBeInTheDocument();
    expect(within(ardee).getByText("280")).toBeInTheDocument();
    expect(within(ardee).getByText("₹310 Cr")).toBeInTheDocument();
    expect(within(ardee).getByText("5 Aug 2026")).toBeInTheDocument();
    expect(within(ardee).getByText("7 Aug 2026")).toBeInTheDocument();
    expect(within(ardee).getByText("12 Aug 2026")).toBeInTheDocument();

    // Live subscription demand, category by category.
    expect(within(ardee).getByText("2.51x")).toBeInTheDocument();
    expect(within(ardee).getByText("Qualified Institutional Buyers(QIBs)")).toBeInTheDocument();
    expect(within(ardee).getByText("1.10x")).toBeInTheDocument();
    expect(within(ardee).getByText("Retail Individual Investors(RIIs)")).toBeInTheDocument();

    // Unknown fields render as an em dash, never as zero.
    const leap = screen.getByText("Leap India Limited").closest("article")!;
    expect(within(leap).getByText("LEAP · SME")).toBeInTheDocument();
    expect(within(leap).getAllByText("—")).toHaveLength(3);
    expect(within(leap).queryByText("Subscribed")).not.toBeInTheDocument();
  });

  it("filters the board down to a single status", async () => {
    const user = userEvent.setup();
    mockListFetch(feed);
    render(<IpoListings />);

    await screen.findByText("Ardee Industries Limited");
    expect(screen.getByRole("button", { name: /All \(3\)/ })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /Open \(1\)/ }));
    expect(screen.getByText("Ardee Industries Limited")).toBeInTheDocument();
    expect(screen.queryByText("Leap India Limited")).not.toBeInTheDocument();
    expect(screen.queryByText("Juniper Green Energy Limited")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Closed \(1\)/ }));
    expect(screen.getByText("Juniper Green Energy Limited")).toBeInTheDocument();
    expect(screen.queryByText("Ardee Industries Limited")).not.toBeInTheDocument();
  });

  it("explains an empty filter result in terms of that filter", async () => {
    const user = userEvent.setup();
    mockListFetch({ ...feed, ipos: [ipos[0]], counts: { open: 1, upcoming: 0, closed: 0 } });
    render(<IpoListings />);

    await screen.findByText("Ardee Industries Limited");
    await user.click(screen.getByRole("button", { name: /Upcoming \(0\)/ }));
    expect(screen.getByText(/No upcoming IPOs on NSE's calendar right now/)).toBeInTheDocument();
  });

  it("shows the empty state when the calendar is bare", async () => {
    mockListFetch({ ...feed, ipos: [], counts: { open: 0, upcoming: 0, closed: 0 } });
    render(<IpoListings />);
    expect(await screen.findByText(/No IPOs on NSE's calendar right now/)).toBeInTheDocument();
  });

  it("shows anticipated IPOs when present and hides the section when empty", async () => {
    mockListFetch({ ...feed, ipos: [], anticipated });
    render(<IpoListings />);
    expect(await screen.findByText("Delta Logistics")).toBeInTheDocument();
    expect(screen.getByText("On the radar · no filing window yet")).toBeInTheDocument();
    expect(screen.getByText("Ports & Logistics")).toBeInTheDocument();
  });

  it("hides the anticipated section entirely when there are none", async () => {
    mockListFetch({ ...feed, ipos: [], anticipated: [] });
    render(<IpoListings />);
    await screen.findByText(/No IPOs on NSE's calendar/);
    expect(screen.queryByText("On the radar · no filing window yet")).not.toBeInTheDocument();
  });

  it("falls back to the default caption when the payload carries no source", async () => {
    // ?? only triggers on null/undefined, so the key must be genuinely absent.
    const { source: _source, ...withoutSource } = feed;
    mockListFetch({ ...withoutSource, ipos: [] });
    render(<IpoListings />);
    expect(await screen.findByText(/Loading the NSE IPO calendar…/)).toBeInTheDocument();
  });

  it("shows an error banner when the response is not ok", async () => {
    mockListFetch({}, false);
    render(<IpoListings />);
    expect(await screen.findByText(/Couldn't reach the IPO data feed/)).toBeInTheDocument();
  });

  it("shows an error banner when the fetch rejects", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down"));
    render(<IpoListings />);
    expect(await screen.findByText(/Couldn't reach the IPO data feed/)).toBeInTheDocument();
  });

  // An issue lists under the ticker it has already been allotted, so that is what the logo is
  // looked up by — and a company with no logo on file gets a lettered tile, not a broken image.
  it("falls back to a monogram when the logo image fails to load", async () => {
    mockListFetch({ ...feed, ipos: [ipos[0]] });
    render(<IpoListings />);

    const img = await screen.findByAltText("ARDEE logo");
    fireEvent.error(img);

    expect(screen.queryByAltText("ARDEE logo")).not.toBeInTheDocument();
    expect(screen.getByText("ARD")).toBeInTheDocument();
  });

  // An unlisted candidate has no ticker to look up, so it always draws the monogram — but its
  // website is hand-checked rather than guessed, so a curated logo is still honoured.
  it("uses the curated logo for a company that has not listed yet", async () => {
    mockListFetch({ ...feed, ipos: [], anticipated });
    render(<IpoListings />);

    expect(await screen.findByAltText("Delta Logistics logo")).toHaveAttribute("src", "https://logo.test/delta.png");
  });

  it("renders IPO cards as static entries, with no AI research call", async () => {
    mockListFetch({ ...feed, anticipated });
    render(<IpoListings />);

    await screen.findByText("Ardee Industries Limited");
    const card = screen.getByText("Ardee Industries Limited").closest("article");
    expect(card).toBeInTheDocument();
    expect(card!.tagName).toBe("ARTICLE");
    expect(screen.getByText("Delta Logistics").closest("article")).toBeInTheDocument();

    // Per-stock AI research belongs to the research section; this board only reads the calendar
    // and asks the desk to read the board as a whole.
    const calls = (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));
    expect(calls).toEqual(["/api/market/ipos", "/api/ai/board-read"]);
  });
});

describe("ipoBrief", () => {
  const counts = { open: 1, upcoming: 1, closed: 1 };

  // A second open issue, so the "most subscribed first" ordering is actually exercised.
  const quieter = {
    ...ipos[0],
    id: "QUIET",
    symbol: "QUIET",
    company: "Quiet Issue Limited",
    subscription: { overall: 0.4, categories: [] },
  };

  it("counts the pipeline and leads on the most-subscribed open issue", () => {
    const brief = ipoBrief([quieter, ...ipos], { ...counts, open: 2 })!;

    expect(brief.highlights[0]).toMatch(/Ardee Industries Limited/);
    expect(brief.highlights[1]).toMatch(/Quiet Issue Limited/);
  });

  it("counts the pipeline by status and board", () => {
    const brief = ipoBrief(ipos, counts)!;

    expect(brief.facts).toContainEqual({ label: "Open for bids", value: "1" });
    expect(brief.facts).toContainEqual({ label: "Upcoming", value: "1" });
    expect(brief.facts).toContainEqual({ label: "Recently closed", value: "1" });
    expect(brief.facts).toContainEqual({ label: "Mainboard vs SME", value: "2 / 1" });
    expect(brief.highlights[0]).toMatch(/Ardee Industries Limited \(Mainboard\).*subscribed 2.51x/);
  });

  it("reads an issue with no subscription figures yet as unsubscribed rather than as a blank", () => {
    const brief = ipoBrief([{ ...ipos[0], subscription: null }], counts)!;
    expect(brief.highlights[0]).toMatch(/subscribed \u2014/);
  });

  // Two open issues that NSE has not published demand for yet must not make the sort throw or
  // silently reorder on undefined \u2014 they both count as zero and keep their listed order.
  it("orders two issues that have no subscription figures at all", () => {
    const alsoQuiet = { ...ipos[0], id: "HUSH", symbol: "HUSH", company: "Hush Issue Limited", subscription: null };
    const brief = ipoBrief([{ ...ipos[0], subscription: null }, alsoQuiet], { ...counts, open: 2 })!;

    expect(brief.highlights[0]).toMatch(/Ardee Industries Limited/);
    expect(brief.highlights[1]).toMatch(/Hush Issue Limited/);
  });

  it("has nothing to read when the calendar is empty", () => {
    expect(ipoBrief([], counts)).toBeNull();
  });
});
