import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "audio-tools",
  description: "Beat-stabilize, chord-chart, and stem-split your audio.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
