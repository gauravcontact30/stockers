import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./lib/theme-provider";
import { SubscriptionProvider } from "./components/subscription-provider";
import { SubscriptionReminder } from "./components/subscription-reminder";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stockers.AI | AI Indian Stock Market Researcher",
  description: "An AI-powered stock research assistant for Indian investors with market news, trend analysis, and positive/negative sentiment insights.",
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
            {children}
            <SubscriptionReminder />
          </SubscriptionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
