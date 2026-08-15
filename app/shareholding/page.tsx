import HomeSectionPage, { homeSectionMetadata } from "../lib/home-section-page";

export const metadata = homeSectionMetadata("ownership");

export default function ShareholdingPage() {
  return <HomeSectionPage id="ownership" />;
}
