// The retail brokers this site tracks, and what each of them actually publishes.
//
// Dependency-free on purpose: the board that renders these names is a client component, while the
// code that fetches the lists reaches the network and Next's cache. Same split, same reason, as
// ./bse-platform.
//
// The honest scope, stated where the names are defined:
//
// No broker publishes a "most searched" ranking. Search frequency is in-app telemetry and none of
// the five exposes it, so a "most searched on Groww" figure could only be invented. What one of the
// five does publish is a "most bought" list on its own public site, labelled as its own customers'
// buying — a real, attributable fact, carried here under the broker's own wording.
//
// The other four are declared rather than dropped, each with the reason it carries no data: a
// platform missing from the UI looks like an oversight, while one that says "publishes no public
// feed" is telling the reader something true about the platform.

export type BrokerId = "groww" | "zerodha" | "angel-one" | "upstox" | "icici-direct";

export type Broker = {
  id: BrokerId;
  name: string;
  /** Standing among Indian brokers by active retail clients, 1 = largest. */
  standing: number;
  blurb: string;
  /**
   * The public list this broker publishes, under the broker's own label for it, or null when the
   * broker keeps its customer activity in-app.
   */
  feed: { label: string; url: string } | null;
  /** Why nothing is collected, for the brokers that publish nothing. */
  unavailable?: string;
};

/** The five platforms tracked, in order of active retail clients. */
export const BROKERS: Broker[] = [
  {
    id: "groww",
    name: "Groww",
    standing: 1,
    blurb: "India's largest broker by active retail clients; a clean interface aimed at beginners.",
    feed: { label: "Most bought on Groww", url: "https://groww.in/stocks/most-bought-stocks-on-groww" },
  },
  {
    id: "zerodha",
    name: "Zerodha",
    standing: 2,
    blurb: "Kite's web and mobile terminal, favoured by active traders for transparent pricing.",
    feed: null,
    unavailable: "Publishes no aggregate of what its customers hold or buy — Console is per-account only.",
  },
  {
    id: "angel-one",
    name: "Angel One",
    standing: 3,
    blurb: "Full-service discount brokerage with advanced charting and advisory.",
    feed: null,
    unavailable: "Its trending and most-traded lists live inside the app, behind a login.",
  },
  {
    id: "upstox",
    name: "Upstox",
    standing: 4,
    blurb: "Low-cost brokerage with strong analytics and digital onboarding.",
    feed: null,
    unavailable: "Top Traded and Most Active are in-app smartlists with no public page.",
  },
  {
    id: "icici-direct",
    name: "ICICI Direct",
    standing: 5,
    blurb: "The largest bank-backed full-service broker, with 3-in-1 account integration.",
    feed: null,
    unavailable: "Publishes research notes rather than any aggregate of customer activity.",
  },
];

/** A broker that actually publishes a list, with `feed` narrowed so callers need no guard. */
export type PublishingBroker = Broker & { feed: NonNullable<Broker["feed"]> };

/** The brokers that contribute data, which is the set the board ranks and filters by. */
export const PUBLISHING_BROKERS: PublishingBroker[] = BROKERS.filter(
  (broker): broker is PublishingBroker => broker.feed !== null,
);

/** One broker's placing for one scrip, as that broker publishes it. */
export type BrokerPick = {
  broker: BrokerId;
  brokerName: string;
  /** The broker's own words for the list — never re-labelled as "most searched". */
  label: string;
  /** Position in that broker's published list, 1 = top. */
  rank: number;
};
