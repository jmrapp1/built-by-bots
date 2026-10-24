import "./globals.css";
import type { Viewport } from "next";
import { MOBILE_ENABLED } from "@/lib/touchInput";

export const metadata = { title: "Blotty" };
// S37: the touch viewport (notch fill, keyboard resizes the content) is set only when the mobile flag is on; off leaves the page as before.
export const viewport: Viewport | undefined = MOBILE_ENABLED ? { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" } : undefined;
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
