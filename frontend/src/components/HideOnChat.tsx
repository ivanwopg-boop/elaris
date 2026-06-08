"use client";
import { usePathname } from "next/navigation";

export default function HideOnChat({ children }: { children: React.ReactNode }) {
  const p = usePathname();
  if (p.startsWith('/chat/') || p.startsWith('/guest-chat/')) return null;
  return <>{children}</>;
}
