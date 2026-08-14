import HomeSectionPage, { homeSectionMetadata } from "../lib/home-section-page";

export const dynamic = "force-static";
export const fetchCache = "default-cache";
export const revalidate = 60;
export const metadata = homeSectionMetadata("ownership");

export default function ShareholdingPage() {
  return <HomeSectionPage id="ownership" />;
}
