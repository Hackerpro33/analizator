import React from "react";
import { cn } from "@/lib/utils";

export default function PageContainer({
  children,
  className,
  maxWidth = "max-w-7xl",
  fullWidth = false,
  disablePadding = false,
}) {
  return (
    <div
      className={cn(
        "relative min-h-full w-full",
        disablePadding ? null : "px-4 py-8 sm:px-6 lg:px-10"
      )}
    >
      <div
        className={cn(
          "mx-auto w-full",
          fullWidth ? "max-w-none" : maxWidth,
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

