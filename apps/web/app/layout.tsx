import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EcoPower 3.0",
  description: "Energy-as-a-Service for Indian distribution utilities",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
