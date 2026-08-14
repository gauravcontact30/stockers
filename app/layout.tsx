import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./lib/theme-provider";
import { StockDetailProvider } from "./components/stock-detail-provider";
import { SubscriptionProvider } from "./components/subscription-provider";
import { PresenceTracker } from "./components/presence-tracker";
import { SubscriptionReminder } from "./components/subscription-reminder";
import { VisitTracker } from "./components/visit-tracker";
import { JsonLd } from "./components/json-ld";
import {
  absoluteUrl,
  graph,
  HTML_LANG,
  organizationSchema,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TITLE,
  siteUrl,
  softwareApplicationSchema,
  websiteSchema,
} from "./lib/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: SITE_NAME, url: siteUrl() }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "Finance",
  classification: "Financial research software",
  referrer: "origin-when-cross-origin",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: siteUrl(),
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_IN",
    images: [
      {
        url: absoluteUrl("/opengraph-image"),
        width: 1200,
        height: 630,
        alt: "StockersAI - AI stock research for Indian markets",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [absoluteUrl("/twitter-image")],
  },
};

/**
 * Stated rather than left to the framework default, for the last clause.
 *
 * `viewportFit: cover` lets the page paint into the notch/rounded-corner area on a modern phone,
 * which is what the `env(safe-area-inset-*)` padding in the sticky header and bottom bars is for.
 * `maximumScale` is deliberately absent: capping zoom locks out anyone who needs to enlarge text.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

// Applied before hydration so the correct theme paints on first frame (no flash of the wrong theme).
const themeInitScript = `(function () {
  try {
    var stored = localStorage.getItem("stockers-theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    if (theme === "dark") document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={HTML_LANG} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <JsonLd schema={graph(organizationSchema(), websiteSchema(), softwareApplicationSchema())} />
        <ThemeProvider>
          {/* Wraps the whole app so any section can ask whether a feature is unlocked, and the
              renewal reminder can appear on whichever page the user lands on. */}
          <SubscriptionProvider>
            {/* Mounted app-wide so any board can open a company's detail sheet by ticker. */}
            <StockDetailProvider>
              {children}
              <SubscriptionReminder />
              {/* Renders nothing — reports one page view per page per tab, so the admin dashboard
                  can say how many people arrived today rather than how many accounts exist. */}
              <VisitTracker />
              {/* Renders nothing either — says once a minute that this tab is still open, which is
                  what lets the admin dashboard answer how many people are on the site right now
                  rather than how many arrived today. */}
              <PresenceTracker />
            </StockDetailProvider>
          </SubscriptionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
