import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileNav } from "../../app/components/mobile-nav";

const links = [
  { href: "#market-pulse", label: "Market Pulse" },
  { href: "#pricing", label: "Pricing" },
];

describe("MobileNav", () => {
  // Same-page anchors stay plain <a> so the browser scrolls; links to another route go through
  // next/link for client-side navigation. Both must end up as working links in the drawer.
  it("renders both same-page anchors and route links", async () => {
    const user = userEvent.setup();
    render(<MobileNav links={[...links, { href: "/news", label: "News" }]} />);

    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "News" })).toHaveAttribute("href", "/news");
    });
    expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "#pricing");
  });

  it("closes the drawer when a route link is followed", async () => {
    const user = userEvent.setup();
    render(<MobileNav links={[{ href: "/news", label: "News" }]} />);

    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "News" })).toBeInTheDocument());

    await user.click(screen.getByRole("link", { name: "News" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "News" })).not.toBeInTheDocument());
  });

  it("does not render the drawer before the open button is clicked", () => {
    render(<MobileNav links={links} />);
    expect(screen.queryByLabelText("Close navigation menu")).not.toBeInTheDocument();
  });

  it("opens the drawer, locks body scroll, and closes via the backdrop", async () => {
    const user = userEvent.setup();
    render(<MobileNav links={links} />);

    const openButton = screen.getByRole("button", { name: "Open navigation menu" });
    expect(openButton).toHaveAttribute("aria-expanded", "false");
    await user.click(openButton);

    await waitFor(() => {
      expect(screen.getAllByLabelText("Close navigation menu").length).toBeGreaterThan(0);
    });
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("link", { name: "Market Pulse" })).toHaveAttribute("href", "#market-pulse");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/signup");

    const backdrop = screen.getAllByLabelText("Close navigation menu")[0];
    await user.click(backdrop);

    await waitFor(() => {
      expect(screen.queryByLabelText("Close navigation menu")).not.toBeInTheDocument();
    });
    expect(document.body.style.overflow).toBe("");
  });

  it("closes via the explicit close (X) button", async () => {
    const user = userEvent.setup();
    render(<MobileNav links={links} />);
    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));

    const closeButtons = await screen.findAllByLabelText("Close navigation menu");
    // second one is the explicit X button inside the drawer panel
    await user.click(closeButtons[1]);

    await waitFor(() => {
      expect(screen.queryByLabelText("Close navigation menu")).not.toBeInTheDocument();
    });
  });

  it("closes when a nav link is clicked", async () => {
    const user = userEvent.setup();
    render(<MobileNav links={links} />);
    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));

    await screen.findAllByLabelText("Close navigation menu");
    await user.click(screen.getByRole("link", { name: "Market Pulse" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("Close navigation menu")).not.toBeInTheDocument();
    });
  });

  it("closes when the Sign in link is clicked", async () => {
    const user = userEvent.setup();
    render(<MobileNav links={links} />);
    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));

    await screen.findAllByLabelText("Close navigation menu");
    await user.click(screen.getByRole("link", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("Close navigation menu")).not.toBeInTheDocument();
    });
  });

  it("closes when the Get started link is clicked", async () => {
    const user = userEvent.setup();
    render(<MobileNav links={links} />);
    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));

    await screen.findAllByLabelText("Close navigation menu");
    await user.click(screen.getByRole("link", { name: "Get started" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("Close navigation menu")).not.toBeInTheDocument();
    });
  });
});
