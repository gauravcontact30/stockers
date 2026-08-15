import { render, screen, within } from "@testing-library/react";
import { Suspense } from "react";
import { AiFeaturesPayload, featureHref } from "../../app/components/ai-features-showcase";
import { AiFeaturesFallback, StreamedAiFeatures } from "../../app/components/streamed-ai-features";
import { AI_FEATURES } from "../../app/lib/plan-tiers";
import { readFeatureLocks } from "../../app/lib/subscription";
import { DASHBOARD_SECTION_ROUTES } from "../../app/lib/section-routes";

jest.mock("../../app/lib/subscription", () => ({
  readFeatureLocks: jest.fn(),
}));

const locks = readFeatureLocks as jest.MockedFunction<typeof readFeatureLocks>;

beforeEach(() => {
  locks.mockResolvedValue({});
});

describe("featureHref", () => {
  /**
   * The feature keys and the dashboard section *ids* are the same strings by design, so the lookup
   * is by id rather than a second mapping to keep in step. The URL is the section's own path, which
   * is not always the id — `sectors` lives at `/sector-trends`.
   *
   * This is the assertion that matters: every feature resolves to a real section's real path, so a
   * key that stopped matching would be caught here rather than silently linking to the root.
   */
  it("sends every feature to its own dashboard section", () => {
    const pathById = new Map(DASHBOARD_SECTION_ROUTES.map((route) => [route.id, route.path]));

    for (const feature of AI_FEATURES) {
      // `news` is the exception: it is the public page, not a dashboard section.
      if (feature.key === "news") continue;

      const expected = pathById.get(feature.key);
      expect(expected).toBeDefined();
      expect(featureHref(feature.key)).toBe(expected);
    }
  });

  it("sends the news feature to the public news page", () => {
    expect(featureHref("news")).toBe("/news");
  });

  it("falls back to the dashboard root for a key it does not know", () => {
    expect(featureHref("not-a-feature")).toBe("/overview");
  });
});

describe("AiFeaturesPayload", () => {
  it("lists every feature, with its blurb and the plan that holds it", async () => {
    render(await AiFeaturesPayload());

    for (const feature of AI_FEATURES) {
      expect(screen.getByText(feature.label)).toBeInTheDocument();
      expect(screen.getByText(feature.blurb)).toBeInTheDocument();
    }

    expect(screen.getAllByRole("link", { name: /Open in dashboard/ })).toHaveLength(AI_FEATURES.length);
  });

  it("groups the features by plan, cheapest first", async () => {
    const { container } = render(await AiFeaturesPayload());

    const headings = [...container.querySelectorAll("h3")].map((node) => node.textContent);
    expect(headings).toEqual(["Starter", "Pro", "Elite"]);
  });

  it("links each card at the section that feature opens in", async () => {
    render(await AiFeaturesPayload());

    const pulse = screen.getByText("AI market pulse").closest("a");
    expect(pulse).toHaveAttribute("href", "/market-pulse");
  });

  /**
   * The database's half of this section.
   *
   * `public.feature_locks` is the admin's kill switch, and a locked feature is unreachable in the
   * dashboard — so advertising it on the landing page would be an invitation to a locked door.
   */
  it("leaves out a feature the admin has switched off", async () => {
    locks.mockResolvedValue({ intel: true, research: true } as Awaited<ReturnType<typeof readFeatureLocks>>);
    render(await AiFeaturesPayload());

    expect(screen.queryByText("AI intelligence search")).not.toBeInTheDocument();
    expect(screen.queryByText("AI stock research")).not.toBeInTheDocument();
    // Everything else is untouched.
    expect(screen.getByText("AI market pulse")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Open in dashboard/ })).toHaveLength(AI_FEATURES.length - 2);
  });

  it("drops a whole plan's heading when every feature in it is switched off", async () => {
    const elite = AI_FEATURES.filter((feature) => feature.tier === "elite");
    locks.mockResolvedValue(
      Object.fromEntries(elite.map((feature) => [feature.key, true])) as Awaited<ReturnType<typeof readFeatureLocks>>,
    );
    const { container } = render(await AiFeaturesPayload());

    expect([...container.querySelectorAll("h3")].map((node) => node.textContent)).toEqual(["Starter", "Pro"]);
  });

  // Everything switched off at once is not a state worth drawing an empty section for.
  it("renders nothing at all when every feature is switched off", async () => {
    locks.mockResolvedValue(
      Object.fromEntries(AI_FEATURES.map((feature) => [feature.key, true])) as Awaited<
        ReturnType<typeof readFeatureLocks>
      >,
    );

    expect(await AiFeaturesPayload()).toBeNull();
  });

  it("counts the live features in its own summary line", async () => {
    locks.mockResolvedValue({ intel: true } as Awaited<ReturnType<typeof readFeatureLocks>>);
    render(await AiFeaturesPayload());

    expect(screen.getByText(new RegExp(`${AI_FEATURES.length - 1} AI surfaces`))).toBeInTheDocument();
  });

  it("offers the trial and the plans at the foot of the section", async () => {
    const { container } = render(await AiFeaturesPayload());
    const footer = container.querySelector("section > div:last-child")!;

    expect(within(footer as HTMLElement).getByRole("link", { name: "Start the free trial" })).toHaveAttribute(
      "href",
      "/signup",
    );
    expect(within(footer as HTMLElement).getByRole("link", { name: "Compare the plans" })).toHaveAttribute(
      "href",
      "/pricing",
    );
  });
});

describe("the streamed boundary", () => {
  // A Supabase round trip sits between the hero and every board below it, so it goes behind its
  // own boundary rather than holding the page.
  it("puts the section behind its own boundary, with its chrome as the fallback", () => {
    const element = StreamedAiFeatures();

    expect(element.type).toBe(Suspense);
    expect(element.props.children.type).toBe(AiFeaturesPayload);
  });

  it("holds the section's chrome while the locks are read", () => {
    const { container } = render(<AiFeaturesFallback />);

    expect(container.querySelector("section")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});
