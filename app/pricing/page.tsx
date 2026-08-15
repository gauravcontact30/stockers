import HomeSectionPage, { homeSectionMetadata } from "../lib/home-section-page";

export const metadata = homeSectionMetadata("pricing");

export default function PricingPage() {
  return <HomeSectionPage id="pricing" />;
}
