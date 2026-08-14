// One ranked list on a market card.
//
// This file exists as a Client Component for a reason the tests cannot see — its columns carry
// functions, and functions cannot cross the RSC boundary — so what is checked here is what a reader
// gets: the company with its mark, tier and industry, five to a page, and a shareholding sheet that
// is not fetched until a row is opened.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoverList } from "../../app/components/mover-list";

jest.mock("../../app/components/company-logo", () => ({
  CompanyLogo: ({ symbol }: { symbol: string }) => <span data-testid={`logo-${symbol}`} />,
}));

jest.mock("../../app/components/ownership-modal", () => ({
  OwnershipModal: ({ symbol }: { symbol: string | null }) => <div data-testid="ownership-modal" data-symbol={symbol} />,
}));

function row(ticker: string, returnPercent: number, extra: Record<string, unknown> = {}) {
  return {
    code: `c-${ticker}`,
    ticker,
    name: `${ticker} Ltd`,
    returnPercent,
    capTier: "Large",
    sector: "capital-goods",
    ...extra,
  };
}

const ROWS = [row("HAL", 9.5), row("LT", 8.25), row("BEL", 7), row("PARAS", 6.5), row("MAZDOCK", 5), row("NETWEB", 4)];

function renderList(rows = ROWS) {
  return render(<MoverList rows={rows as never} caption="Top gainers" empty="Nothing higher today." pageSize={5} />);
}

describe("MoverList", () => {
  it("shows each company with its mark, tier and industry", () => {
    renderList();

    expect(screen.getByTestId("logo-HAL")).toBeInTheDocument();
    expect(screen.getByText("HAL")).toBeInTheDocument();
    expect(screen.getByText("HAL Ltd")).toBeInTheDocument();
    // The catalogue's key, spelled the way a person reads it.
    expect(screen.getAllByText("Capital Goods").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Large cap").length).toBeGreaterThan(0);
  });

  it("signs the move", () => {
    renderList();
    expect(screen.getByText("+9.50%")).toBeInTheDocument();
  });

  it("pages five at a time", () => {
    renderList();

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    // Five companies plus the header row.
    expect(screen.getAllByRole("row")).toHaveLength(6);
  });

  it("offers a search over the list", async () => {
    const person = userEvent.setup();
    renderList();

    await person.type(screen.getByLabelText("Search top gainers"), "MAZ");

    // Scoped to the table: the typeahead offers "MAZDOCK" as a suggestion too, and both are the
    // search working.
    const table = within(screen.getByRole("table"));
    expect(table.getByText("MAZDOCK")).toBeInTheDocument();
    expect(table.queryByText("HAL Ltd")).not.toBeInTheDocument();
  });

  it("leaves the shareholding sheet unmounted until a company is opened", async () => {
    const person = userEvent.setup();
    renderList();

    expect(screen.queryByTestId("ownership-modal")).not.toBeInTheDocument();

    await person.click(screen.getByRole("button", { name: "Who owns HAL" }));

    await waitFor(() => expect(screen.getByTestId("ownership-modal")).toHaveAttribute("data-symbol", "HAL"));
  });

  it("opens the sheet on whichever company was clicked", async () => {
    const person = userEvent.setup();
    renderList();

    await person.click(screen.getByRole("button", { name: "Who owns LT" }));
    await waitFor(() => expect(screen.getByTestId("ownership-modal")).toHaveAttribute("data-symbol", "LT"));
  });

  it("leaves the industry line off a company the catalogue has not classified", () => {
    renderList([row("UNKNOWN", 3, { sector: null, capTier: null })]);

    expect(screen.getByText("UNKNOWN")).toBeInTheDocument();
    expect(screen.queryByTitle(/cap$/)).not.toBeInTheDocument();
  });

  it("says so when there is nothing to rank", () => {
    renderList([]);
    expect(screen.getByText("Nothing higher today.")).toBeInTheDocument();
  });

  it("sorts on the move as well as the company", async () => {
    const person = userEvent.setup();
    renderList();

    await person.click(screen.getByRole("button", { name: /^Move/ }));
    const first = within(screen.getAllByRole("row")[1]);
    expect(first.getByText("+9.50%")).toBeInTheDocument();
  });
});
