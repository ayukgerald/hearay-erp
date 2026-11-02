import "@fontsource-variable/manrope";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/sw-register";

export const metadata: Metadata = {
  title: { default: "Hearay — Renew DStv with Mobile Money", template: "%s · Hearay" },
  description: "Renew your DStv subscription in a minute with MTN Mobile Money or Orange Money.",
  applicationName: "Hearay",
  appleWebApp: { capable: true, title: "Hearay", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#F5F6F8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
