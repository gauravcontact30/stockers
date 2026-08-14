// The shareholding sheet opened from a market row.
//
// Every figure on it is a category the company's own quarterly filing reports, so the tests here
// are about faithfulness: the classes that hold nothing are left off the chart rather than drawn as
// zero-width wedges, a filing that cannot be read says so, and nothing is fetched until it opens.

import { render, screen, waitFor } from "@testing-library/react";
import { OwnershipModal } from "../../app/components/ownership-modal";

jest.mock("../../app/components/company-logo", () => ({
  CompanyLogo: ({ symbol }: { symbol: string }) => <span data-testid={`logo-${symbol}`} />,
}));

// The donut has its own suite; here it only needs to report what it was handed.
jest.mock("../../app/components/pie-chart", () => ({
  PieChart: ({ slices }: { slices: { key: string; label: string; value: number }[] }) => (
    <div data-testid="pie" data-keys={slices.map((slice) => slice.key).join(",")} />
  ),
}));

function filing() {
  return {
    symbol: "RELIANCE",
    company: "Reliance Industries Ltd",
    quarter: "Jun 2026",
    groups: [
      { key: "promoters", label: "Promoters", percent: 50.3, holders: 12, detail: [] },
      { key: "fii", label: "Foreign portfolio investors", percent: 22.1, holders: 1800, detail: [] },
      { key: "retail", label: "Individual shareholders", percent: 27.6, holders: 3_900_000, detail: [] },
      // Reported, and reported as nothing — which is not the same as being on the register.
      { key: "government", label: "Government", percent: 0, holders: null, detail: [] },
    ],
  };
}

function serve(payload: unknown, ok = true) {
  const mock = jest.fn(async (_url: string) => ({ ok, json: async () => payload }) as unknown as Response);
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe("OwnershipModal", () => {
  it("asks for nothing until it is opened", () => {
    const fetchMock = serve(filing());
    render(<OwnershipModal symbol={null} onClose={() => {}} />);

    // A page of five rows would otherwise pull five filings nobody asked to see.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the filing for the company it was opened on", async () => {
    const fetchMock = serve(filing());
    render(<OwnershipModal symbol="RELIANCE" onClose={() => {}} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("symbol=RELIANCE");
    expect(await screen.findByText("Reliance Industries Ltd")).toBeInTheDocument();
    expect(screen.getByText(/Shareholding as filed for Jun 2026/)).toBeInTheDocument();
  });

  it("charts only the classes that actually hold something", async () => {
    serve(filing());
    render(<OwnershipModal symbol="RELIANCE" onClose={() => {}} />);

    const pie = await screen.findByTestId("pie");
    // Government reports 0% and is left off: a zero-width wedge is noise on the chart and a row of
    // nothing in the legend.
    expect(pie).toHaveAttribute("data-keys", "promoters,fii,retail");
  });

  it("lists each class with the percentage the filing states", async () => {
    serve(filing());
    render(<OwnershipModal symbol="RELIANCE" onClose={() => {}} />);

    expect(await screen.findByText("50.30%")).toBeInTheDocument();
    expect(screen.getByText("22.10%")).toBeInTheDocument();
    expect(screen.getByText("Promoters")).toBeInTheDocument();
  });

  it("says so when no filing could be read, rather than charting nothing", async () => {
    serve({ error: "No filing could be read for this company." }, false);
    render(<OwnershipModal symbol="NEWCO" onClose={() => {}} />);

    expect(await screen.findByText("No filing could be read for this company.")).toBeInTheDocument();
    expect(screen.queryByTestId("pie")).not.toBeInTheDocument();
  });

  it("falls back to its own wording when a refusal carries no reason", async () => {
    serve({}, false);
    render(<OwnershipModal symbol="NEWCO" onClose={() => {}} />);

    expect(await screen.findByText("No filing could be read for this company.")).toBeInTheDocument();
  });

  it("reports a feed it could not reach", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    render(<OwnershipModal symbol="RELIANCE" onClose={() => {}} />);

    expect(await screen.findByText("offline")).toBeInTheDocument();
  });

  it("says it is reading while the filing is in flight", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<OwnershipModal symbol="RELIANCE" onClose={() => {}} />);

    expect(screen.getByText("Reading the filing...")).toBeInTheDocument();
  });

  it("charts nothing gracefully when a filing does not break the register down", async () => {
    serve({ ...filing(), groups: [] });
    render(<OwnershipModal symbol="RELIANCE" onClose={() => {}} />);

    const pie = await screen.findByTestId("pie");
    expect(pie).toHaveAttribute("data-keys", "");
  });
});
