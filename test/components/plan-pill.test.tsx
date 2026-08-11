import { render, screen } from "@testing-library/react";
import { LockIcon, PlanPill, PlanRibbon, StarRating, TIER_CHROME } from "../../app/components/plan-pill";
import { TIER_LABEL, type PlanTier } from "../../app/lib/plan-tiers";

const TIERS: PlanTier[] = ["starter", "pro", "elite"];

describe("TIER_CHROME", () => {
  it("dresses every tier the app can be on", () => {
    expect(Object.keys(TIER_CHROME).sort()).toEqual(["elite", "pro", "starter"]);
  });

  // Sky for Starter, emerald for Pro, violet for Elite — the same palette as the pricing table,
  // so a reader recognises a tier without reading the word.
  it("gives each tier its own colour family across all five surfaces", () => {
    const families: Record<PlanTier, string> = { starter: "sky", pro: "emerald", elite: "violet" };

    for (const tier of TIERS) {
      for (const surface of Object.values(TIER_CHROME[tier])) {
        expect(surface).toContain(families[tier]);
      }
    }
  });
});

describe("LockIcon", () => {
  it("is decoration, so it is hidden from a screen reader", () => {
    const { container } = render(<LockIcon className="h-3 w-3" />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("h-3", "w-3");
  });

  it("renders without a className", () => {
    const { container } = render(<LockIcon />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

describe("PlanPill", () => {
  it.each(TIERS)("names the %s tier and wears its chrome", (tier) => {
    render(<PlanPill tier={tier} />);
    const pill = screen.getByText(TIER_LABEL[tier]);

    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute("title", `Included in ${TIER_LABEL[tier]}`);
  });

  // The same pill labels a feature the reader has and one they do not, so those must not read
  // identically: locked adds the padlock and changes the title from "included" to "required".
  it("marks a locked feature with a padlock and says the plan is required", () => {
    const { container } = render(<PlanPill tier="pro" locked />);

    expect(screen.getByText("Pro")).toHaveAttribute("title", "Pro plan required");
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("draws no padlock when the feature is included", () => {
    const { container } = render(<PlanPill tier="pro" />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("takes an extra className without losing its own", () => {
    render(<PlanPill tier="elite" className="ml-2" />);
    const pill = screen.getByText("Elite");

    expect(pill).toHaveClass("ml-2");
    expect(pill).toHaveClass("inline-flex");
  });
});

describe("PlanRibbon", () => {
  it("labels the corner with the plan, once, for a screen reader", () => {
    render(<PlanRibbon tier="starter" />);

    // The outer element carries the label; the rotated inner banner is hidden so the tier is not
    // announced twice.
    const ribbon = screen.getByLabelText("Starter plan");
    expect(ribbon).toHaveAttribute("title", "Starter plan");
    expect(ribbon.querySelector("[aria-hidden='true']")).toBeInTheDocument();
  });

  it("shows a star when the plan is held and a padlock when it is not", () => {
    const { container: unlocked } = render(<PlanRibbon tier="pro" />);
    // The star path is the filled mark; the padlock is drawn as a rect plus a shackle path.
    expect(unlocked.querySelectorAll("rect")).toHaveLength(0);

    const { container: locked } = render(<PlanRibbon tier="pro" locked />);
    expect(locked.querySelectorAll("rect")).toHaveLength(1);
  });

  it.each(TIERS)("wears the %s frame and banner", (tier) => {
    render(<PlanRibbon tier={tier} />);
    expect(screen.getByLabelText(`${TIER_LABEL[tier]} plan`)).toHaveClass(...TIER_CHROME[tier].ribbonFrame.split(" "));
  });
});

describe("StarRating", () => {
  it("renders the rating out of three by default", () => {
    const { container } = render(<StarRating stars={2} tier="pro" />);

    expect(screen.getByLabelText("2 out of 3 stars")).toBeInTheDocument();
    expect(container.querySelectorAll("svg")).toHaveLength(3);
    // Two filled, one outline.
    expect(container.querySelectorAll("svg[fill='currentColor']")).toHaveLength(2);
    expect(container.querySelectorAll("svg[fill='none']")).toHaveLength(1);
  });

  it("honours a different total", () => {
    const { container } = render(<StarRating stars={4} tier="elite" total={5} />);

    expect(screen.getByLabelText("4 out of 5 stars")).toBeInTheDocument();
    expect(container.querySelectorAll("svg")).toHaveLength(5);
  });

  // Only three features per plan carry a rating, so the rest render nothing rather than a row of
  // empty stars that would read as a score of zero.
  it("renders nothing for a feature with no rating", () => {
    const { container } = render(<StarRating stars={0} tier="pro" />);
    expect(container).toBeEmptyDOMElement();

    const { container: negative } = render(<StarRating stars={-1} tier="pro" />);
    expect(negative).toBeEmptyDOMElement();
  });

  it("wears the tier's accent", () => {
    render(<StarRating stars={1} tier="starter" />);
    expect(screen.getByLabelText("1 out of 3 stars")).toHaveClass(...TIER_CHROME.starter.accent.split(" "));
  });
});
