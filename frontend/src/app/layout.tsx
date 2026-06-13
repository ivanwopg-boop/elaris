import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};


import "./globals.css";
import Navbar from "@/components/Navbar";
import { ToastProvider } from "@/components/Toast";
import HideOnChat from "@/components/HideOnChat";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";

export const metadata: Metadata = {
  title: "Elaris",
  description: "Turn any person's wisdom into a reusable AI persona",
  icons: [{url: "/pwa-192.png", sizes: "192x192"}, {url: "/pwa-512.png", sizes: "512x512"}],
  appleWebApp: { capable: true, title: "Elaris", statusBarStyle: "default" },
  themeColor: "#FAFAFA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <head>
        <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png" />
        <link rel="apple-touch-startup-image" href="/splash-iphone-2688.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash-iphone-2532.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash-iphone-2436.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash-ipad-2732.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)" />
      </head>
      <body className="min-h-full flex flex-col bg-[#FAFAFA] text-[#1D1D1F] font-sans">
        <HideOnChat><Navbar /></HideOnChat>
        <main className="flex-1">
          <ToastProvider>{children}</ToastProvider>
        </main>
        <PwaInstallPrompt />
        <HideOnChat><footer className="border-t border-[rgba(0,0,0,0.06)] py-8 mt-16">
          <div className="max-w-7xl mx-auto px-6 text-center text-xs text-[#86868B] font-light tracking-wide space-y-2">
            <div className="flex items-center justify-center gap-6">
              <a href="/safety" className="hover:text-[#1D1D1F] transition-colors">Safety</a>
              <a href="/terms" className="hover:text-[#1D1D1F] transition-colors">Terms</a>
              <a href="/privacy" className="hover:text-[#1D1D1F] transition-colors">Privacy</a>
            </div>
            <p>Elaris</p>
          </div>
        </footer></HideOnChat>
      </body>
    </html>
  );
}