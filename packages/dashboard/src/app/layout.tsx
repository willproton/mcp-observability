import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MCP Observability",
  description: "Real-time Claude Code MCP observability dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
