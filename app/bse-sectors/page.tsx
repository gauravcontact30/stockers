import HomeSectionPage, { homeSectionMetadata } from "../lib/home-section-page";

export const metadata = homeSectionMetadata("bse-sectors");

export default function BseSectorsPage() {
  return <HomeSectionPage id="bse-sectors" />;
}
