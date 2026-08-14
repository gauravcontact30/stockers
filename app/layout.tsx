import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./lib/theme-provider";
import { StockDetailProvider } from "./components/stock-detail-provider";
import { SubscriptionProvider } from "./components/subscription-provider";
import { PresenceTracker } from "./components/presence-tracker";
import { SubscriptionReminder } from "./components/subscription-reminder";
import { VisitTracker } from "./components/visit-tracker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StockersAI | AI Indian Stock Market Researcher",
  description: "An AI-powered stock research assistant for Indian investors with market news, trend analysis, and positive/negative sentiment insights.",
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
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
