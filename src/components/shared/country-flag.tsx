import { cn } from "@/lib/utils";

interface CountryFlagProps {
  code: string;
  name?: string;
  size?: "sm" | "md";
  className?: string;
}

export function CountryFlag({ code, name, size = "md", className }: CountryFlagProps) {
  return (
    <span
      className={cn(
        `fi fi-${code.toLowerCase()} fis`,
        size === "sm" ? "text-xs" : "text-sm",
        "inline-block shrink-0 rounded-full",
        className
      )}
      role="img"
      aria-label={name || code}
    />
  );
}
