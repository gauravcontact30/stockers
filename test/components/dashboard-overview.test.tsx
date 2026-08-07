import { act, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { OverviewHeader, greeting, sessionBrief } from "../../app/components/dashboard-overview";
import { istMoment } from "../../app/components/market-clock";

// IST is UTC+5:30, so every instant below is written in UTC and named by the IST time it lands
// on. 2026-08-03 is a Monday and 2026-08-08 a Saturday.
const moment = (utc: string) => istMoment(new Date(utc).getTime());

describe("sessionBrief", () => {
  it.each([
    ["2026-08-08T04:30:00Z", "weekend", "Closed for the weekend"],
    ["2026-08-09T04:30:00Z", "weekend", "Closed for the weekend"],
    ["2026-08-03T02:30:00Z", "before", "Before the pre-open"],
    ["2026-08-03T03:35:00Z", "pre-open", "Pre-open auction"],
    ["2026-08-03T04:30:00Z", "live", "Continuous trading"],
    ["2026-08-03T10:15:00Z", "post", "Post-close session"],
    ["2026-08-03T11:30:00Z", "closed", "Closed for the day"],
  ])("reads %s as %s", (utc, key, label) => {
    const brief = sessionBrief(moment(utc));
    expect(brief.key).toBe(key);
    expect(brief.label).toBe(label);
  });

  // The boundaries are the whole point of the panel, so each is pinned to the minute.
  it("switches exactly on the session boundaries", () => {
    expect(sessionBrief(moment("2026-08-03T03:30:00Z")).key).toBe("pre-open"); // 09:00 IST
    expect(sessionBrief(moment("2026-08-03T03:44:00Z")).key).toBe("pre-open"); // 09:14 IST
    expect(sessionBrief(moment("2026-08-03T03:45:00Z")).key).toBe("live"); // 09:15 IST
    expect(sessionBrief(moment("2026-08-03T09:59:00Z")).key).toBe("live"); // 15:29 IST
    expect(sessionBrief(moment("2026-08-03T10:00:00Z")).key).toBe("post"); // 15:30 IST
    expect(sessionBrief(moment("2026-08-03T10:30:00Z")).key).toBe("closed"); // 16:00 IST
  });

  it("gives every state its own lamp and a note explaining it", () => {
    const seen = new Set<string>();
    for (const utc of [
      "2026-08-08T04:30:00Z",
      "2026-08-03T02:30:00Z",
      "2026-08-03T03:35:00Z",
      "2026-08-03T04:30:00Z",
      "2026-08-03T10:15:00Z",
      "2026-08-03T11:30:00Z",
    ]) {
      const brief = sessionBrief(moment(utc));
      expect(brief.note.length).toBeGreaterThan(0);
      expect(brief.dot).toMatch(/^bg-/);
      seen.add(brief.key);
    }
    expect(seen.size).toBe(6);
  });
});

describe("greeting", () => {
  it.each([
    ["2026-08-03T02:30:00Z", "Good morning"], // 08:00 IST
    ["2026-08-03T06:30:00Z", "Good afternoon"], // 12:00 IST, on the boundary
    ["2026-08-03T07:30:00Z", "Good afternoon"], // 13:00 IST
    ["2026-08-03T11:30:00Z", "Good evening"], // 17:00 IST, on the boundary
    ["2026-08-03T13:30:00Z", "Good evening"], // 19:00 IST
  ])("greets %s with %s", (utc, expected) => {
    expect(greeting(moment(utc))).toBe(expected);
  });
});

describe("OverviewHeader", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * The server has no idea what time it is for the reader, so the shared clock reports 0 until
   * its interval has run. The server render therefore has to say something neutral rather than
   * print a time that would change the moment the page hydrates.
   */
  it("prints no time on the server render", () => {
    jest.setSystemTime(new Date("2026-08-03T04:30:00Z"));
    const html = renderToStaticMarkup(<OverviewHeader name="Aarav" />);

    expect(html).toContain("Syncing IST clock…");
    expect(html).toContain("Welcome back");
    expect(html).not.toContain("IST<");
  });

  it("shows the session, the IST time and highlights the current slot in the timetable", () => {
    jest.setSystemTime(new Date("2026-08-03T04:30:00Z"));
    render(<OverviewHeader name="Aarav" />);
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText("Good morning")).toBeInTheDocument();
    expect(screen.getByText("Aarav")).toBeInTheDocument();
    expect(screen.getByText(/^10:00:0\d IST$/)).toBeInTheDocument();
    expect(screen.getByText("Continuous trading")).toBeInTheDocument();

    const slot = screen.getByText("9:15 – 15:30").closest("div")!;
    expect(slot.className).toContain("bg-emerald-50");
  });

  it("keeps up as the session changes underneath it", () => {
    jest.setSystemTime(new Date("2026-08-03T09:59:00Z")); // 15:29 IST
    render(<OverviewHeader name="Aarav" />);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Continuous trading")).toBeInTheDocument();

    jest.setSystemTime(new Date("2026-08-03T10:01:00Z")); // 15:31 IST
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Post-close session")).toBeInTheDocument();
  });

  // Saying "live" on Diwali would be wrong, so the panel says what it does not know.
  it("admits it does not know the exchange holiday calendar", () => {
    jest.setSystemTime(new Date("2026-08-03T04:30:00Z"));
    render(<OverviewHeader name="Aarav" />);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/Exchange holidays are not accounted for/)).toBeInTheDocument();
  });
});
