import "./fonts.css";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Session Materials Creator — Musiversal",
  description: "Beat-stabilize, chord-chart, and stem-split your audio in one step.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
