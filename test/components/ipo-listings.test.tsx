import { render, screen, fireEvent, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IpoListings } from "../../app/components/ipo-listings";

jest.mock("../../app/components/ai-report-modal", () => ({
  AiReportModal: (props: any) => (
    <div
      data-testid="ai-report-modal"
      data-open={String(props.open)}
      data-symbol={props.analysis?.stock ?? ""}
      data-logo={props.logoUrl ?? ""}
      data-company={props.companyName ?? ""}
      data-loading={String(props.loading)}
    >
      <button data-testid="modal-close" onClick={props.onClose}>
        close
      </button>
    </div>
  ),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function mockListFetch(response: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: async () => response,
  } as Response);
}

const ipos = [
  {
    id: "ipo-1",
    company: "Alpha Manufacturing",
    sector: "Capital Goods",
    domain: "alpha.example.com",
    exchange: "NSE",
    summary: "A leading maker of industrial components.",
    logo: "https://logo.test/alpha.png",
    status: "open" as const,
    priceBandMin: 100,
    priceBandMax: 120,
    issueSizeCr: 500,
    openDate: "2026-08-01",
    closeDate: "2026-08-05",
    listingDate: "2026-08-10",
  },
  {
    id: "ipo-2",
    company: "Beta Digital",
    sector: "IT Services",
    domain: "beta.example.com",
    exchange: "BSE",
    summary: "A cloud services provider entering public markets.",
    logo: "https://logo.test/beta.png",
    status: "listing_soon" as const,
    // no price band / dates -> exercise all the falsy conditional branches
  },
  {
    id: "ipo-3",
    company: "Gamma Retail",
    sector: "Retail",
    domain: "gamma.example.com",
    exchange: "NSE",
    summary: "A growing omni-channel retail chain.",
    logo: "https://logo.test/gamma.png",
    status: "upcoming" as const,
    priceBandMin: 50,
    priceBandMax: 60,
    // no issueSizeCr -> price band shown without the "Cr issue" suffix
    openDate: "2026-08-15",
    closeDate: "2026-08-18",
    // no listingDate
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

describe("IpoListings", () => {
  it("shows loading skeletons before data arrives", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(<IpoListings />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
    expect(screen.getByText("Snapshot as of …")).toBeInTheDocument();
  });

  it("renders open/listing_soon/upcoming statuses and all date/price-band branches", async () => {
    mockListFetch({ ipos, anticipated: [], asOfDate: "2026-08-04", source: "Curated by our editorial team" });
    render(<IpoListings />);

    expect(await screen.findByText("Alpha Manufacturing")).toBeInTheDocument();
    expect(screen.getByText("Snapshot as of 2026-08-04")).toBeInTheDocument();
    expect(screen.getByText(/Curated by our editorial team/)).toBeInTheDocument();

    expect(screen.getByText("Open for subscription")).toBeInTheDocument();
    expect(screen.getByText("Subscription closed · listing soon")).toBeInTheDocument();
    expect(screen.getByText("Opening soon")).toBeInTheDocument();

    const alphaCard = screen.getByText("Alpha Manufacturing").closest("button")!;
    expect(within(alphaCard).getByText(/Price band:/)).toBeInTheDocument();
    expect(within(alphaCard).getByText(/₹100–₹120/)).toBeInTheDocument();
    expect(within(alphaCard).getByText(/500 Cr issue/)).toBeInTheDocument();
    expect(within(alphaCard).getByText(/Subscription: 1 Aug 2026 – 5 Aug 2026/)).toBeInTheDocument();
    expect(within(alphaCard).getByText(/Tentative listing: 10 Aug 2026/)).toBeInTheDocument();

    const betaCard = screen.getByText("Beta Digital").closest("button")!;
    expect(within(betaCard).queryByText(/Price band:/)).not.toBeInTheDocument();
    expect(within(betaCard).queryByText(/Subscription:/)).not.toBeInTheDocument();
    expect(within(betaCard).queryByText(/Tentative listing:/)).not.toBeInTheDocument();

    const gammaCard = screen.getByText("Gamma Retail").closest("button")!;
    expect(within(gammaCard).getByText(/₹50–₹60/)).toBeInTheDocument();
    expect(within(gammaCard).queryByText(/Cr issue/)).not.toBeInTheDocument();
    expect(within(gammaCard).getByText(/Subscription: 15 Aug 2026 – 18 Aug 2026/)).toBeInTheDocument();
    expect(within(gammaCard).queryByText(/Tentative listing:/)).not.toBeInTheDocument();
  });

  it("shows anticipated IPOs when present and hides the section when empty", async () => {
    // source omitted (undefined) -> falls back to the default snapshot caption ( ?? only
    // triggers on null/undefined, not on an empty string, so this must be genuinely absent).
    mockListFetch({ ipos: [], anticipated, asOfDate: "2026-08-04" });
    render(<IpoListings />);
    expect(await screen.findByText("Delta Logistics")).toBeInTheDocument();
    expect(screen.getByText("On the radar · no filing window yet")).toBeInTheDocument();
    expect(screen.getByText("Filed DRHP privately; expected to launch next quarter.")).toBeInTheDocument();
    expect(screen.getByText(/Listing details are a manually curated snapshot/)).toBeInTheDocument();
  });

  it("hides the anticipated section entirely when there are none", async () => {
    mockListFetch({ ipos: [], anticipated: [], asOfDate: "2026-08-04", source: "" });
    render(<IpoListings />);
    await screen.findByText(/No open or upcoming IPOs/);
    expect(screen.queryByText("On the radar · no filing window yet")).not.toBeInTheDocument();
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

  it("shows the empty state when there are no IPOs and no error", async () => {
    mockListFetch({ ipos: [], anticipated: [], asOfDate: "2026-08-04", source: "" });
    render(<IpoListings />);
    expect(await screen.findByText("No open or upcoming IPOs in the current snapshot.")).toBeInTheDocument();
  });

  it("falls back to initials when the logo image fails to load", async () => {
    mockListFetch({ ipos: [ipos[0]], anticipated: [], asOfDate: "2026-08-04", source: "" });
    render(<IpoListings />);
    const img = await screen.findByAltText("Alpha Manufacturing logo");
    fireEvent.error(img);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("selects an IPO, shows loading then the analysis in the modal, and closes it", async () => {
    const user = userEvent.setup();
    const research = deferred<Response>();
    global.fetch = jest.fn((url: any) => {
      if (String(url).includes("/api/research")) return research.promise;
      return Promise.resolve({
        ok: true,
        json: async () => ({ ipos, anticipated: [], asOfDate: "2026-08-04", source: "" }),
      } as Response);
    }) as unknown as typeof fetch;

    render(<IpoListings />);
    await screen.findByText("Alpha Manufacturing");

    const alphaCard = screen.getByText("Alpha Manufacturing").closest("button")!;
    await user.click(alphaCard);

    let modal = screen.getByTestId("ai-report-modal");
    expect(modal).toHaveAttribute("data-open", "true");
    expect(modal).toHaveAttribute("data-loading", "true");
    expect(modal).toHaveAttribute("data-logo", "https://logo.test/alpha.png");
    expect(modal).toHaveAttribute("data-company", "Alpha Manufacturing");
    expect(alphaCard).toHaveClass("border-indigo-400");

    await act(async () => {
      research.resolve({ ok: true, json: async () => ({ stock: "Alpha Manufacturing", score: 70 }) } as Response);
      await research.promise;
    });

    modal = screen.getByTestId("ai-report-modal");
    expect(modal).toHaveAttribute("data-loading", "false");
    expect(modal).toHaveAttribute("data-symbol", "Alpha Manufacturing");

    await user.click(screen.getByTestId("modal-close"));
    expect(screen.getByTestId("ai-report-modal")).toHaveAttribute("data-open", "false");
  });

  it("selects an anticipated IPO and requests analysis for it too", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn((url: any) => {
      if (String(url).includes("/api/research")) {
        return Promise.resolve({ ok: true, json: async () => ({ stock: "Delta Logistics", score: 55 }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ipos: [], anticipated, asOfDate: "2026-08-04", source: "" }),
      } as Response);
    }) as unknown as typeof fetch;

    render(<IpoListings />);
    const deltaCard = await screen.findByText("Delta Logistics").then((el) => el.closest("button")!);
    await user.click(deltaCard);

    const modal = await screen.findByText((_, node) => node?.getAttribute?.("data-symbol") === "Delta Logistics");
    expect(modal).toHaveAttribute("data-company", "Delta Logistics");
    expect(modal).toHaveAttribute("data-logo", "https://logo.test/delta.png");
  });
});
