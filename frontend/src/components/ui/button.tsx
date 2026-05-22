import React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const base = "inline-flex items-center justify-center rounded-[10px] font-normal transition-all duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed";

  const variants = {
    primary: "bg-[#1D1D1F] text-white hover:bg-[#2a2a2e] active:bg-[#111113]",
    secondary: "bg-white border border-[rgba(0,0,0,0.08)] text-[#1D1D1F] hover:bg-[rgba(0,0,0,0.02)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
    ghost: "text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-[rgba(0,0,0,0.03)]",
    danger: "bg-white border border-[rgba(0,0,0,0.08)] text-red-500 hover:bg-red-50",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-5 py-2.5 text-sm",
    lg: "px-6 py-3 text-sm",
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-3.5 w-3.5" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}