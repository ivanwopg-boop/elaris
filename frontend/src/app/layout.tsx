import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};


import "./globals.css";
import Navbar from "@/components/Navbar";
import HideOnChat from "@/components/HideOnChat";

export const metadata: Metadata = {
  title: "Elaris",
  description: "Turn any person's wisdom into a reusable AI persona",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#FAFAFA] text-[#1D1D1F] font-sans">
        <HideOnChat><Navbar /></HideOnChat>
        <main className="flex-1">
          {children}
        </main>
        <HideOnChat><footer className="border-t border-[rgba(0,0,0,0.06)] py-8 mt-16">
          <div className="max-w-7xl mx-auto px-6 text-center text-xs text-[#86868B] font-light tracking-wide">
            Elaris
          </div>
        </footer></HideOnChat>
      </body>
    </html>
  );
}