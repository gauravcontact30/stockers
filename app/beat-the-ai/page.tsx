import HomeSectionPage, { homeSectionMetadata } from "../lib/home-section-page";

export const dynamic = "force-static";
export const fetchCache = "default-cache";
export const revalidate = 60;
export const metadata = homeSectionMetadata("head-to-head");

export default function BeatTheAiPage() {
  return <HomeSectionPage id="head-to-head" />;
}
