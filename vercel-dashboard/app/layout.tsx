import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EDITH | Mission Control",
  description: "Environmental Data Intelligence And Tracking Hub. Live environmental sensing and spatial telemetry.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
