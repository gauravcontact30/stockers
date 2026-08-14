import { createSeoImageResponse, SEO_IMAGE_SIZE } from "./lib/seo-image";
import { SEO_IMAGE_ALT } from "./lib/seo";

export const alt = SEO_IMAGE_ALT;
export const size = SEO_IMAGE_SIZE;
export const contentType = "image/png";

export default function Image() {
  return createSeoImageResponse();
}
