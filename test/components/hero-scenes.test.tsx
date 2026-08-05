import { render } from "@testing-library/react";
import {
  TickerTape,
  ResearchDeskScene,
  TradingLaptopScene,
  BseTickerBoardScene,
  MarketAnalysisScene,
} from "../../app/components/hero-scenes";

describe("hero-scenes", () => {
  it("renders TickerTape with the (duplicated) ticker row", () => {
    const { container } = render(<TickerTape />);
    expect(container.querySelectorAll("span").length).toBeGreaterThan(0);
  });

  it("renders ResearchDeskScene", () => {
    const { container } = render(<ResearchDeskScene />);
    expect(container.firstChild).toBeTruthy();
  });

  it("renders TradingLaptopScene (with its live ticker rail, up and down)", () => {
    const { container } = render(<TradingLaptopScene />);
    expect(container.firstChild).toBeTruthy();
  });

  it("renders BseTickerBoardScene (with mixed up/down scrips)", () => {
    const { container } = render(<BseTickerBoardScene />);
    expect(container.firstChild).toBeTruthy();
  });

  it("renders MarketAnalysisScene (with its bullish/bearish candlestick chart, dice letters, and calculator)", () => {
    const { container } = render(<MarketAnalysisScene />);
    expect(container.firstChild).toBeTruthy();
    // The candlestick chart draws a mix of bullish (green) and bearish (red) candles.
    expect(container.querySelectorAll('rect[fill="#34d399"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('rect[fill="#fb7185"]').length).toBeGreaterThan(0);
  });
});
