import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "../lib/theme";
import "./globals.css";

// Geist is Vercel's typeface designed for software UI. Replaces Inter +
// JetBrains Mono — its tighter metrics and software-native vibe give the app
// a more professional feel without bespoke licensing.
const sans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const mono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Lattice — an AI-native vault for your thinking",
  description:
    "Lattice is a local-first, AI-native knowledge vault. Notes you own, search that understands meaning, and capture that turns half-formed thoughts into clean notes.",
  applicationName: "Lattice",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0d0b" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="antialiased font-sans bg-canvas text-fg-default">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
