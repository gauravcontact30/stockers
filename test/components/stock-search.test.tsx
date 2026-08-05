import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StockSearch } from "../../app/components/stock-search";

describe("StockSearch", () => {
  it("renders every stock option by default (empty query)", () => {
    render(<StockSearch onSelect={jest.fn()} />);
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("TCS")).toBeInTheDocument();
    expect(screen.getByText("HDFCBANK")).toBeInTheDocument();
    expect(screen.getByText("INFY")).toBeInTheDocument();
    expect(screen.getByText("ICICIBANK")).toBeInTheDocument();
    expect(screen.getByText("SBIN")).toBeInTheDocument();
  });

  it("filters by symbol match", async () => {
    const user = userEvent.setup();
    render(<StockSearch onSelect={jest.fn()} />);
    const input = screen.getByPlaceholderText("Type a company or symbol");
    await user.type(input, "tcs");
    expect(screen.getByText("TCS")).toBeInTheDocument();
    expect(screen.queryByText("RELIANCE")).not.toBeInTheDocument();
  });

  it("filters by company name match", async () => {
    const user = userEvent.setup();
    render(<StockSearch onSelect={jest.fn()} />);
    const input = screen.getByPlaceholderText("Type a company or symbol");
    await user.type(input, "infosys");
    expect(screen.getByText("INFY")).toBeInTheDocument();
    expect(screen.queryByText("TCS")).not.toBeInTheDocument();
  });

  it("shows no results for a query that matches nothing", async () => {
    const user = userEvent.setup();
    render(<StockSearch onSelect={jest.fn()} />);
    const input = screen.getByPlaceholderText("Type a company or symbol");
    await user.type(input, "zzzz");
    expect(screen.queryByText("RELIANCE")).not.toBeInTheDocument();
    expect(screen.queryByText("TCS")).not.toBeInTheDocument();
  });

  it("calls onSelect and fills the query when a result is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(<StockSearch onSelect={onSelect} />);

    const button = screen.getByRole("button", { name: /RELIANCE[\s\S]*Reliance Industries[\s\S]*Energy & Petrochemicals/ });
    await user.click(button);

    expect(onSelect).toHaveBeenCalledWith("RELIANCE");
    const input = screen.getByPlaceholderText("Type a company or symbol") as HTMLInputElement;
    expect(input.value).toBe("RELIANCE");
  });

  it("trims whitespace-only queries to show the full list", async () => {
    const user = userEvent.setup();
    render(<StockSearch onSelect={jest.fn()} />);
    const input = screen.getByPlaceholderText("Type a company or symbol");
    await user.type(input, "   ");
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("SBIN")).toBeInTheDocument();
  });
});
