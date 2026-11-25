import type { Metadata } from "next";
import Loading from "./loading";
import { RouteNavigation } from "./route-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Regional Directory",
  description: "Manage Church units, callings, and contacts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><RouteNavigation loading={<Loading />}>{children}</RouteNavigation></body></html>;
}
