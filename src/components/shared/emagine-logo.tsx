import { cn } from "@/lib/utils";
import { Scale } from "lucide-react";

interface EmagineLogoProps {
  className?: string;
}

export function EmagineLogo({ className }: EmagineLogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Scale className="h-[1em] w-[1em]" />
      <span className="font-semibold tracking-tight text-[1.15em] leading-none">
        Legal AI
      </span>
    </div>
  );
}
