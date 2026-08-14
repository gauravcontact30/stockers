import HomeSectionPage, { homeSectionMetadata } from "../lib/home-section-page";

export const dynamic = "force-static";
export const fetchCache = "default-cache";
export const revalidate = 60;
export const metadata = homeSectionMetadata("live-market");

export default function LiveMarketPage() {
  return <HomeSectionPage id="live-market" />;
}
