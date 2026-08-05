import { act, render, screen } from "@testing-library/react";
import { MarketNews } from "../../app/components/market-news";

describe("MarketNews", () => {
  it("fetches and renders news items from /api/news", async () => {
    const payload = [
      { title: "Sensex rallies", summary: "Markets close higher.", sentiment: "Positive" },
      { title: "Rupee steady", summary: "Currency holds range.", sentiment: "Neutral" },
    ];

    global.fetch = jest.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve(payload),
      })
    ) as unknown as typeof fetch;

    await act(async () => {
      render(<MarketNews />);
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/news");
    expect(screen.getByText("Sensex rallies")).toBeInTheDocument();
    expect(screen.getByText("Markets close higher.")).toBeInTheDocument();
    expect(screen.getByText("Positive")).toBeInTheDocument();
    expect(screen.getByText("Rupee steady")).toBeInTheDocument();
  });

  it("renders no articles when the feed is empty", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve([]),
      })
    ) as unknown as typeof fetch;

    await act(async () => {
      render(<MarketNews />);
    });

    expect(screen.getByText("Current market pulse")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
});
