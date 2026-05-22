import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = { sm: "w-8 h-8 text-sm", md: "w-10 h-10 text-base", lg: "w-14 h-14 text-xl" };
const COLORS = ["#0071e3","#7c3aed","#22c55e","#eab308","#ec4899","#06b6d4","#f97316","#14b8a6"];

export function Avatar({ name, url, size = "md", className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const colorIdx = Math.abs(name.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % COLORS.length;
  const bg = COLORS[colorIdx];
  const initial = name.charAt(0).toUpperCase();

  if (!url || failed) {
    return (
      <div className={cn("rounded-full flex items-center justify-center font-semibold shrink-0", SIZES[size], className)}
        style={{ backgroundColor: `${bg}20`, color: bg }}>
        {initial}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={name}
      crossOrigin="anonymous"
      onError={() => setFailed(true)}
      className={cn("rounded-full shrink-0", SIZES[size], className,
        url.includes("dicebear.com") ? "" : "object-cover")}
      style={{ backgroundColor: `${bg}15` }}
    />
  );
}