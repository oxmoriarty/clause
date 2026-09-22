import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clause — understand before you sign",
  description: "A privacy-first contract reading workspace with optional GenLayer verification."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
