import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker";
import { LEGACY_THEME_STORAGE_KEY } from "@/lib/theme";

/* Phase 49b (clinical blueprint): ONE family for every piece of interface
   text. The spec's face is Geist; its NAMED SUBSTITUTE is Inter, which is
   what this Next version's font pipeline ships — same geometric neutrality
   at 400/500/600 with tight tracking on display sizes. */
const geist = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Orbit",
  description: "Progress tracker for SGROUP projects.",
  applicationName: "Orbit",
  manifest: "/manifest.webmanifest",
  // iOS has no manifest support worth the name; these drive Add to Home Screen.
  appleWebApp: {
    capable: true,
    title: "Orbit",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  /* One theme, one browser-chrome colour. This API cannot read a CSS
     variable, so it is the single place a literal has to be repeated. */
  themeColor: "#f2f6fc",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * The app is light-only, so there is no theme to resolve before paint. This
 * only clears a preference stored by an older build, so a browser that once
 * chose dark is not carrying a dead key around forever.
 */
const clearLegacyTheme = `
(function(){
  try { localStorage.removeItem(${JSON.stringify(LEGACY_THEME_STORAGE_KEY)}); } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: clearLegacyTheme }} />
      </head>
      <body className={`${geist.variable} font-sans`}>
        <ServiceWorkerRegister />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
