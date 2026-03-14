import React from "react";
import { cn } from "@/lib/utils";

export default function PageContainer({
  children,
  className,
  maxWidth = "max-w-7xl",
  fullWidth = false,
  disablePadding = false,
}) {
  const containerSpacing = disablePadding
    ? "px-3 py-4 sm:px-4 lg:px-5"
    : "px-3 py-6 sm:px-6 lg:px-10";

  const contentLayout = className && className.trim().length > 0 ? className : "space-y-6";

  return (
    <div className={cn("relative min-h-full w-full", containerSpacing)}>
      <div
        className={cn(
          "mx-auto w-full rounded-3xl border border-slate-200/80 bg-white/95 px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur",
          "sm:px-6 sm:py-6 lg:px-8",
          fullWidth ? "max-w-none" : maxWidth,
          "transition-shadow duration-300 ease-out hover:shadow-[0_22px_55px_rgba(15,23,42,0.12)]",
          contentLayout
        )}
      >
        {children}
      </div>
    </div>
  );
}
