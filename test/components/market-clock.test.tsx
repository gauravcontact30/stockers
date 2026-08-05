import { act, render, renderHook, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { MarketClock, istMoment, marketSession, useClockTick } from "../../app/components/market-clock";

// 2026-08-05 is a Wednesday. All timestamps below are expressed in UTC; IST is UTC+5:30, so
// 04:00Z is 09:30 IST — fifteen minutes into the session.
const MID_SESSION = Date.parse("2026-08-05T04:00:00.000Z");
const BEFORE_OPEN = Date.parse("2026-08-05T03:00:00.000Z"); // 08:30 IST
const AFTER_CLOSE = Date.parse("2026-08-05T10:30:00.000Z"); // 16:00 IST
const SATURDAY = Date.parse("2026-08-08T04:00:00.000Z");
const SUNDAY = Date.parse("2026-08-09T04:00:00.000Z");

const TRADED_TODAY = "2026-08-05T04:00:00.000Z";
const TRADED_YESTERDAY = "2026-08-04T09:45:00.000Z";

describe("istMoment", () => {
  it("renders the IST day and second-resolution time", () => {
    const moment = istMoment(MID_SESSION);
    expect(moment.dayLabel).toBe("Wednesday, 05 Aug 2026");
    expect(moment.timeLabel).toBe("09:30:00");
    expect(moment.minuteOfDay).toBe(9 * 60 + 30);
    expect(moment.dateKey).toBe("2026-08-05");
    expect(moment.isWeekend).toBe(false);
  });

  // A UTC timestamp late in the day is already tomorrow in IST; the clock must follow IST, not
  // the viewer's own timezone.
  it("rolls to the next IST day for a late-evening UTC time", () => {
    const moment = istMoment(Date.parse("2026-08-05T19:00:00.000Z"));
    expect(moment.dayLabel).toBe("Thursday, 06 Aug 2026");
    expect(moment.dateKey).toBe("2026-08-06");
  });

  // hourCycle h23 rather than hour12:false — the latter renders IST midnight as hour "24".
  it("renders IST midnight as hour 00, not 24", () => {
    expect(istMoment(Date.parse("2026-08-05T18:30:00.000Z")).timeLabel).toBe("00:00:00");
  });

  it.each([
    [SATURDAY, "Saturday"],
    [SUNDAY, "Sunday"],
  ])("flags %s as a weekend", (timestamp, weekday) => {
    const moment = istMoment(timestamp);
    expect(moment.weekday).toBe(weekday);
    expect(moment.isWeekend).toBe(true);
  });
});

describe("marketSession", () => {
  it("is open on a weekday inside the session when the exchange traded today", () => {
    const session = marketSession(MID_SESSION, TRADED_TODAY);
    expect(session).toEqual({ state: "open", open: true, label: "Open · live until 15:30 IST" });
  });

  it("is open when the feed reports no trade time at all", () => {
    expect(marketSession(MID_SESSION, null).open).toBe(true);
  });

  // The clock alone cannot tell a trading Tuesday from Republic Day — a weekday in the session
  // window with no trade printed today is an exchange holiday.
  it("detects an exchange holiday from a stale last trade", () => {
    const session = marketSession(MID_SESSION, TRADED_YESTERDAY);
    expect(session).toEqual({ state: "holiday", open: false, label: "Closed · exchange holiday" });
  });

  it("treats an unparseable last-trade time as a holiday rather than assuming open", () => {
    expect(marketSession(MID_SESSION, "not-a-date").state).toBe("holiday");
  });

  it.each([
    [BEFORE_OPEN, "pre-open", "Pre-open · opens 09:15 IST"],
    [AFTER_CLOSE, "closed", "Closed · ended 15:30 IST"],
    [SATURDAY, "weekend", "Closed · weekend"],
    [SUNDAY, "weekend", "Closed · weekend"],
  ])("is closed at %s as %s", (timestamp, state, label) => {
    const session = marketSession(timestamp, TRADED_TODAY);
    expect(session.open).toBe(false);
    expect(session.state).toBe(state);
    expect(session.label).toBe(label);
  });

  // 15:30 IST is the closing bell, so the session is already over at exactly that minute.
  it("closes exactly at 15:30 IST and is still open a minute before", () => {
    expect(marketSession(Date.parse("2026-08-05T09:59:00.000Z"), TRADED_TODAY).open).toBe(true); // 15:29 IST
    expect(marketSession(Date.parse("2026-08-05T10:00:00.000Z"), TRADED_TODAY).open).toBe(false); // 15:30 IST
  });

  it("opens exactly at 09:15 IST and is still shut a minute before", () => {
    expect(marketSession(Date.parse("2026-08-05T03:45:00.000Z"), TRADED_TODAY).open).toBe(true); // 09:15 IST
    expect(marketSession(Date.parse("2026-08-05T03:44:00.000Z"), TRADED_TODAY).open).toBe(false);
  });
});

describe("useClockTick", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(MID_SESSION);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("hands back the current time and advances it every second", () => {
    const { result } = renderHook(() => useClockTick());
    expect(result.current).toBe(MID_SESSION);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(MID_SESSION + 2000);
  });
});

describe("MarketClock", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(MID_SESSION);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("ticks forward once per second", () => {
    render(<MarketClock lastTradeAt={TRADED_TODAY} />);

    expect(screen.getByText("09:30:00")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText("09:30:01")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByText("09:30:04")).toBeInTheDocument();
  });

  it("shows the IST day and the open-session status", () => {
    render(<MarketClock lastTradeAt={TRADED_TODAY} />);
    expect(screen.getByText("Wednesday, 05 Aug 2026")).toBeInTheDocument();
    expect(screen.getByText("Open · live until 15:30 IST")).toBeInTheDocument();
    expect(screen.getByText("IST")).toBeInTheDocument();
  });

  it("reports a closed session when the market is shut", () => {
    jest.setSystemTime(AFTER_CLOSE);
    render(<MarketClock lastTradeAt={TRADED_TODAY} />);
    expect(screen.getByText("Closed · ended 15:30 IST")).toBeInTheDocument();
  });

  it("defaults to no last-trade time when the prop is omitted", () => {
    render(<MarketClock />);
    expect(screen.getByText("Open · live until 15:30 IST")).toBeInTheDocument();
  });

  it("applies the caller's classes", () => {
    const { container } = render(<MarketClock className="test-clock" />);
    expect(container.querySelector(".test-clock")).toBeInTheDocument();
  });

  // On the server there is no ticking clock and no viewer timezone, so rendering a time there
  // would guarantee a hydration mismatch. The server snapshot is 0, which renders a placeholder.
  it("renders a placeholder rather than a mismatched time on the server", () => {
    const html = renderToString(<MarketClock lastTradeAt={TRADED_TODAY} />);
    expect(html).toContain("Syncing IST clock…");
    expect(html).not.toContain("09:30");
  });

  // Two clocks on one page must share a single interval, and it must be torn down on unmount.
  it("stops ticking once every clock unmounts", () => {
    const first = render(<MarketClock />);
    const second = render(<MarketClock />);
    expect(jest.getTimerCount()).toBe(1);

    first.unmount();
    expect(jest.getTimerCount()).toBe(1);

    second.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
