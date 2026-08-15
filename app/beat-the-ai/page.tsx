import HomeSectionPage, { homeSectionMetadata } from "../lib/home-section-page";

export const metadata = homeSectionMetadata("head-to-head");

export default function BeatTheAiPage() {
  return <HomeSectionPage id="head-to-head" />;
}
