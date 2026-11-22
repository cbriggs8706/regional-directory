import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Regional Directory",
  description: "Manage Church units, callings, and contacts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
