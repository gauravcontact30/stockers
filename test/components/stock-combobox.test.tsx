import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { StockCombobox, formatChange, formatPrice, type Suggestion } from "../../app/components/stock-combobox";

/**
 * The box is controlled by whatever renders it — the research panel keeps the ticker in its own
 * state — so every test drives it through the same small host rather than a bare uncontrolled
 * render, which would not reflect a chosen row back into the input.
 */
function Host({ onSelect, className }: { onSelect?: (symbol: string) => void; className?: string }) {
  const [value, setValue] = useState("");
  return (
    <StockCombobox
      value={value}
      onChange={setValue}
      onSelect={onSelect}
      className={className}
      placeholder="Try HDFC BANK or TCS"
    />
  );
}

const RELIANCE: Suggestion = {
  symbol: "RELIANCE",
  name: "Reliance Industries",
  sector: "Energy & Petrochemicals",
  capTier: "Large",
  scripCode: "500325",
  price: 1487.6,
  changePercent: 1.24,
};

const TCS: Suggestion = {
  symbol: "TCS",
  name: "Tata Consultancy Services",
  sector: "Information Technology",
  capTier: "Large",
  scripCode: "532540",
  price: 3120.25,
  changePercent: -0.87,
};

/** A scrip that did not trade in the session the tape covers: priced null, unchanged null. */
const UNTRADED: Suggestion = {
  symbol: "SMALLCO",
  name: "Small Company",
  sector: "Unclassified",
  capTier: "Small",
  scripCode: "500999",
  price: null,
  changePercent: null,
};

function mockSuggestions(body: { suggestions?: Suggestion[]; total?: number }, ok = true) {
  const fetchMock = jest.fn().mockResolvedValue({ ok, json: async () => body } as Response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** Opens the list and waits for the debounced request behind it to land. */
async function openList(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByPlaceholderText("Try HDFC BANK or TCS");
  await user.click(input);
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  return input;
}

describe("formatPrice", () => {
  it("renders a rupee amount to two decimals", () => {
    expect(formatPrice(1487.6)).toBe("₹1,487.60");
  });

  it("renders a dash for a scrip that has no price", () => {
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice(Number.NaN)).toBe("—");
  });
});

describe("formatChange", () => {
  it("signs the move in both directions", () => {
    expect(formatChange(1.24)).toBe("+1.24%");
    expect(formatChange(-0.87)).toBe("-0.87%");
  });

  it("renders nothing when there is no usable number", () => {
    expect(formatChange(null)).toBe("");
    expect(formatChange(Number.NaN)).toBe("");
  });
});

describe("StockCombobox", () => {
  it("stays closed until the box is used, and asks for the catalogue when it opens", async () => {
    const user = userEvent.setup();
    const fetchMock = mockSuggestions({ suggestions: [RELIANCE, TCS], total: 2 });
    render(<Host />);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await openList(user);

    expect(fetchMock).toHaveBeenCalledWith("/api/stocks/suggest?q=&limit=24", expect.objectContaining({ signal: expect.anything() }));
    expect(await screen.findByText("Popular BSE stocks")).toBeInTheDocument();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("shows each suggestion with its logo, name, ticker, sector and live price", async () => {
    const user = userEvent.setup();
    mockSuggestions({ suggestions: [RELIANCE, TCS], total: 2 });
    render(<Host />);
    await openList(user);

    const rows = await screen.findAllByRole("option");
    expect(rows).toHaveLength(2);

    const reliance = within(rows[0]);
    expect(reliance.getByText("Reliance Industries")).toBeInTheDocument();
    expect(reliance.getByText("RELIANCE")).toBeInTheDocument();
    expect(reliance.getByText("Energy & Petrochemicals · Large cap")).toBeInTheDocument();
    expect(reliance.getByText("₹1,487.60")).toBeInTheDocument();
    expect(reliance.getByText("+1.24%")).toBeInTheDocument();
    expect(reliance.getByAltText(/\(RELIANCE\) logo$/)).toBeInTheDocument();

    // A faller is tinted the other way, and both directions carry the sign.
    expect(within(rows[1]).getByText("-0.87%")).toBeInTheDocument();
  });

  it("leaves the change line off a scrip the session never priced", async () => {
    const user = userEvent.setup();
    mockSuggestions({ suggestions: [UNTRADED], total: 1 });
    render(<Host />);
    await openList(user);

    const row = await screen.findByRole("option");
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(within(row).queryByText(/%/)).not.toBeInTheDocument();
  });

  it("searches the exchange on every keystroke and labels the result as matches", async () => {
    const user = userEvent.setup();
    const fetchMock = mockSuggestions({ suggestions: [TCS], total: 1 });
    render(<Host />);

    const input = screen.getByPlaceholderText("Try HDFC BANK or TCS");
    await user.type(input, "tcs");

    expect(screen.getByText("BSE listed matches")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith("/api/stocks/suggest?q=tcs&limit=24", expect.anything()),
    );
    expect(input).toHaveValue("tcs");
  });

  it("says how many of the matches are on screen when the exchange has more", async () => {
    const user = userEvent.setup();
    mockSuggestions({ suggestions: [RELIANCE, TCS], total: 137 });
    render(<Host />);
    await openList(user);

    expect(await screen.findByText("2 of 137")).toBeInTheDocument();
  });

  it("counts the rows itself when the response leaves the total out", async () => {
    const user = userEvent.setup();
    mockSuggestions({ suggestions: [RELIANCE] });
    render(<Host />);
    await openList(user);

    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("falls back to an empty list when the response carries nothing at all", async () => {
    const user = userEvent.setup();
    mockSuggestions({});
    render(<Host />);
    await openList(user);

    expect(await screen.findByText('Nothing listed matches "".')).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("keeps working as a plain input when the suggestions feed refuses", async () => {
    const user = userEvent.setup();
    mockSuggestions({ suggestions: [RELIANCE], total: 1 }, false);
    render(<Host />);

    const input = await openList(user);
    await user.type(input, "TCS");

    expect(await screen.findByText('Nothing listed matches "TCS".')).toBeInTheDocument();
    expect(input).toHaveValue("TCS");
  });

  it("shows the search is running while the request is in flight", async () => {
    const user = userEvent.setup();
    let settle: (value: unknown) => void = () => {};
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    ) as unknown as typeof fetch;

    render(<Host />);
    await openList(user);

    expect(await screen.findByText("Searching…")).toBeInTheDocument();
    expect(screen.getByText("Searching the exchange…")).toBeInTheDocument();

    await act(async () => {
      settle({ ok: true, json: async () => ({ suggestions: [RELIANCE], total: 1 }) });
    });

    expect(await screen.findByRole("option")).toBeInTheDocument();
  });

  it("drops an answer that arrives after the list has closed", async () => {
    const user = userEvent.setup();
    let fail: (reason: unknown) => void = () => {};
    global.fetch = jest.fn(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    ) as unknown as typeof fetch;

    render(<Host />);
    await openList(user);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    // The aborted request rejects afterwards; nothing may be written back from it, and the box
    // stays exactly as the reader left it.
    await act(async () => {
      fail(new Error("aborted"));
    });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("moves through the list with the arrow keys, wrapping at both ends", async () => {
    const user = userEvent.setup();
    mockSuggestions({ suggestions: [RELIANCE, TCS], total: 2 });
    render(<Host />);
    await openList(user);
    await screen.findAllByRole("option");

    const [first, second] = screen.getAllByRole("option");
    expect(first).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}");
    expect(second).toHaveAttribute("aria-selected", "true");

    // Down from the last row wraps to the first, up from the first wraps to the last.
    await user.keyboard("{ArrowDown}");
    expect(first).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowUp}");
    expect(second).toHaveAttribute("aria-selected", "true");
  });

  it("scrolls the highlighted row into view where the browser supports it", async () => {
    const user = userEvent.setup();
    const scrollIntoView = jest.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: scrollIntoView, configurable: true, writable: true });

    mockSuggestions({ suggestions: [RELIANCE, TCS], total: 2 });
    render(<Host />);
    await openList(user);
    await screen.findAllByRole("option");

    await user.keyboard("{ArrowDown}");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });

    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it("re-opens on an arrow key after being dismissed, and ignores arrows over an empty list", async () => {
    const user = userEvent.setup();
    mockSuggestions({ suggestions: [], total: 0 });
    render(<Host />);
    await openList(user);

    // Open, but with nothing to move through: the arrow is a no-op rather than an error.
    await user.keyboard("{ArrowDown}");
    expect(await screen.findByText(/Nothing listed matches/)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("picks the highlighted row on Enter and closes the list", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    mockSuggestions({ suggestions: [RELIANCE, TCS], total: 2 });
    render(<Host onSelect={onSelect} />);
    const input = await openList(user);
    await screen.findAllByRole("option");

    await user.keyboard("{ArrowDown}{Enter}");

    expect(input).toHaveValue("TCS");
    expect(onSelect).toHaveBeenCalledWith("TCS");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("leaves Enter to the form when the list is closed", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    mockSuggestions({ suggestions: [RELIANCE], total: 1 });
    render(<Host onSelect={onSelect} />);
    await openList(user);
    await screen.findAllByRole("option");

    await user.keyboard("{Escape}{Enter}");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clicking a row fills the box, and works without an onSelect handler", async () => {
    const user = userEvent.setup();
    mockSuggestions({ suggestions: [RELIANCE, TCS], total: 2 });
    render(<Host className="flex-1" />);
    const input = await openList(user);
    const rows = await screen.findAllByRole("option");

    // Hovering moves the highlight, which is what a click then commits.
    await user.hover(within(rows[1]).getByRole("button"));
    expect(rows[1]).toHaveAttribute("aria-selected", "true");

    await user.click(within(rows[1]).getByRole("button"));

    expect(input).toHaveValue("TCS");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("carries the chosen company's logo, name and price in the field itself", async () => {
    const user = userEvent.setup();
    mockSuggestions({ suggestions: [RELIANCE, TCS], total: 2 });
    render(<Host />);
    const input = await openList(user);
    const rows = await screen.findAllByRole("option");

    // Nothing picked yet: the logo exists on its list row only, and the field shows no company.
    expect(screen.getAllByAltText(/\(RELIANCE\) logo$/)).toHaveLength(1);
    expect(screen.queryByText("Reliance Industries · Energy & Petrochemicals")).not.toBeInTheDocument();

    await user.click(within(rows[0]).getByRole("button"));

    expect(input).toHaveValue("RELIANCE");
    expect(screen.getByAltText(/\(RELIANCE\) logo$/)).toBeInTheDocument();
    expect(screen.getByText("Reliance Industries · Energy & Petrochemicals")).toBeInTheDocument();
    expect(screen.getByText("₹1,487.60")).toBeInTheDocument();
    expect(screen.getByText("+1.24%")).toBeInTheDocument();
  });

  it("prices a chosen scrip that never traded without inventing a move", async () => {
    const user = userEvent.setup();
    mockSuggestions({ suggestions: [UNTRADED], total: 1 });
    render(<Host />);
    await openList(user);
    const row = await screen.findByRole("option");

    await user.click(within(row).getByRole("button"));

    expect(screen.getByText("Small Company · Unclassified")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("drops the company chrome again once the ticker is typed over", async () => {
    const user = userEvent.setup();
    mockSuggestions({ suggestions: [TCS], total: 1 });
    render(<Host />);
    const input = await openList(user);
    const row = await screen.findByRole("option");

    await user.click(within(row).getByRole("button"));
    expect(screen.getByText("Tata Consultancy Services · Information Technology")).toBeInTheDocument();

    await user.type(input, "X");

    expect(input).toHaveValue("TCSX");
    expect(screen.queryByText("Tata Consultancy Services · Information Technology")).not.toBeInTheDocument();
  });

  it("offers a clear button only once there is something to clear", async () => {
    const user = userEvent.setup();
    mockSuggestions({ suggestions: [RELIANCE], total: 1 });
    render(<Host />);
    const input = await openList(user);

    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();

    await user.click(within(await screen.findByRole("option")).getByRole("button"));
    expect(input).toHaveValue("RELIANCE");

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.queryByText("Reliance Industries · Energy & Petrochemicals")).not.toBeInTheDocument();
    // Clearing hands the reader back the browsable list rather than an empty box.
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("closes on a click outside and stays open for one inside", async () => {
    const user = userEvent.setup();
    mockSuggestions({ suggestions: [RELIANCE], total: 1 });
    render(
      <div>
        <Host />
        <button type="button">elsewhere</button>
      </div>,
    );
    await openList(user);
    await screen.findAllByRole("option");

    await user.click(screen.getByText("Popular BSE stocks"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("points assistive tech at the highlighted row only while there is one", async () => {
    const user = userEvent.setup();
    mockSuggestions({ suggestions: [], total: 0 });
    render(<Host />);
    const input = await openList(user);

    await waitFor(() => expect(screen.getByText(/Nothing listed matches/)).toBeInTheDocument());
    expect(input).not.toHaveAttribute("aria-activedescendant");

    mockSuggestions({ suggestions: [RELIANCE], total: 1 });
    await user.type(input, "rel");

    await screen.findByRole("option");
    expect(input).toHaveAttribute("aria-activedescendant");
  });
});
