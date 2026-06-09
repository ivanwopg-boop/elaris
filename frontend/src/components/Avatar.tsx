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

const COLORS = [
  "bg-[#0071E3]", "bg-[#FF6B35]", "bg-[#34C759]", "bg-[#AF52DE]",
  "bg-[#FF2D55]", "bg-[#5856D6]", "bg-[#FF9500]", "bg-[#00C7BE]",
];

function hashColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

export function Avatar({ name, url, size = "md", className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initials = name.trim().split(/\s+/).map((w) => w.charAt(0)).join("").slice(0, 2).toUpperCase();
  const colorClass = hashColor(name);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name}
        crossOrigin="anonymous"
        onError={() => setFailed(true)}
        className={cn("rounded-full shrink-0 object-cover [object-position:50%_25%] border border-[rgba(0,0,0,0.06)]", SIZES[size], className)}
      />
    );
  }

  return (
    <div className={cn("rounded-full shrink-0 flex items-center justify-center text-white font-medium tracking-tight border border-[rgba(0,0,0,0.06)]", colorClass, SIZES[size], className)}>
      {initials}
    </div>
  );
}
