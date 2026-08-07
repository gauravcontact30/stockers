import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GettingStarted } from "../../app/components/getting-started";

describe("GettingStarted", () => {
  it("lays out a route through the workspace, in order", () => {
    render(<GettingStarted onOpen={jest.fn()} />);

    const steps = screen.getAllByRole("listitem").filter((item) => item.querySelector("h4"));
    expect(steps[0]).toHaveTextContent("Start with the day");
    expect(steps.at(-1)).toHaveTextContent("Look past single stocks");
    expect(within(steps[0]).getByText("1")).toBeInTheDocument();
  });

  // Every route on this page has to actually go somewhere — a map of dead links is worse than none.
  it("opens the section a route points at", async () => {
    const user = userEvent.setup();
    const onOpen = jest.fn();
    render(<GettingStarted onOpen={onOpen} />);

    await user.click(screen.getByRole("button", { name: "Open Market Pulse →" }));
    expect(onOpen).toHaveBeenCalledWith("market-pulse");

    await user.click(screen.getByRole("button", { name: "Company Directory →" }));
    expect(onOpen).toHaveBeenCalledWith("directory");
  });

  it("keeps every FAQ answer closed until it is asked for", async () => {
    const user = userEvent.setup();
    render(<GettingStarted onOpen={jest.fn()} />);

    const question = screen.getByRole("button", { name: /Where do these numbers come from/ });
    expect(question).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/BSE's scrip master and official Bhavcopy/)).not.toBeInTheDocument();

    await user.click(question);
    expect(question).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/BSE's scrip master and official Bhavcopy/)).toBeInTheDocument();

    await user.click(question);
    expect(screen.queryByText(/BSE's scrip master and official Bhavcopy/)).not.toBeInTheDocument();
  });

  // The honesty contract is the thing most worth stating plainly to a new reader.
  it("states what the AI does and does not decide", async () => {
    const user = userEvent.setup();
    render(<GettingStarted onOpen={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: /What exactly is the AI doing/ }));
    expect(screen.getByText(/It writes, it does not decide/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Is any of this investment advice/ }));
    expect(screen.getByText(/not a recommendation to buy or sell anything/)).toBeInTheDocument();
  });

  it("offers a way to reach a human", () => {
    render(<GettingStarted onOpen={jest.fn()} />);

    expect(screen.getByRole("link", { name: /Email support@stockers.ai/ })).toHaveAttribute(
      "href",
      "mailto:support@stockers.ai",
    );
  });
});
