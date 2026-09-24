import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Food4Thought",
  description: "Snap it. Track it. No guessing.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <Nav />
        <main className="mx-auto max-w-3xl p-6">{children}</main>
      </body>
    </html>
  );
}
