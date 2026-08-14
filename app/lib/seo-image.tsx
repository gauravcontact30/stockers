import { ImageResponse } from "next/og";
import { SEO_IMAGE_HEIGHT, SEO_IMAGE_WIDTH, SITE_DESCRIPTION, SITE_NAME } from "./seo";

export const SEO_IMAGE_SIZE = {
  width: SEO_IMAGE_WIDTH,
  height: SEO_IMAGE_HEIGHT,
};

export function createSeoImageResponse(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f8fafc",
          color: "#0f172a",
          padding: 72,
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 72,
              height: 72,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 18,
              background: "#0f766e",
              color: "#ffffff",
              fontSize: 38,
              fontWeight: 800,
            }}
          >
            S
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 34, fontWeight: 800 }}>{SITE_NAME}</div>
            <div style={{ fontSize: 20, color: "#0f766e", fontWeight: 700 }}>BSE AI research platform</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ maxWidth: 910, fontSize: 68, lineHeight: 1.02, fontWeight: 900 }}>
            AI stock research for Indian investors
          </div>
          <div style={{ maxWidth: 930, fontSize: 28, lineHeight: 1.35, color: "#334155" }}>{SITE_DESCRIPTION}</div>
        </div>

        <div style={{ display: "flex", gap: 14, fontSize: 22, fontWeight: 700, color: "#0f766e" }}>
          <span>BSE gainers and losers</span>
          <span>|</span>
          <span>market news sentiment</span>
          <span>|</span>
          <span>shareholding data</span>
        </div>
      </div>
    ),
    SEO_IMAGE_SIZE,
  );
}
