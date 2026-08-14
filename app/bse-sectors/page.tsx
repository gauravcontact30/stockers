import HomeSectionPage, { homeSectionMetadata } from "../lib/home-section-page";

export const dynamic = "force-static";
export const fetchCache = "default-cache";
export const revalidate = 60;
export const metadata = homeSectionMetadata("bse-sectors");

export default function BseSectorsPage() {
  return <HomeSectionPage id="bse-sectors" />;
}
