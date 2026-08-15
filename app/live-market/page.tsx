import HomeSectionPage, { homeSectionMetadata } from "../lib/home-section-page";

export const metadata = homeSectionMetadata("live-market");

export default function LiveMarketPage() {
  return <HomeSectionPage id="live-market" />;
}
