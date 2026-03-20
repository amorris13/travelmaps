import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TravelMaps - Create Beautiful Travel Posters",
  description:
    "Generate print-quality travel and cycling posters from your Strava activities.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
