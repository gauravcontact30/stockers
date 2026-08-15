import HomeSectionPage, { homeSectionMetadata } from "../lib/home-section-page";

export const metadata = homeSectionMetadata("accuracy");

export default function AccuracyPage() {
  return <HomeSectionPage id="accuracy" />;
}
