import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-base",
};

export function Avatar({ name, url, size = "md", className }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  const initial = name.trim().charAt(0).toUpperCase();
  const initials = name.trim().split(/\s+/).map((w) => w.charAt(0)).join("").slice(0, 2).toUpperCase();

  const fallbackUrl = `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(name)}shapes/svg?seed=${encodeURIComponent(name)}`backgroundColor=1D1D1F,2D2D2F,0071E3,86868B,4A4A4D`;

  const effectiveUrl = !url || failed ? fallbackUrl : url;

  return (
    <img
      src={effectiveUrl}
      alt={name}
      crossOrigin="anonymous"
      onError={() => setFailed(true)}
      className={cn("rounded-full shrink-0 object-cover border border-[rgba(0,0,0,0.06)]", SIZES[size], className)}
    />
  );
}