import Image from "next/image";
import { Scale, Shield, FileText, CheckSquare } from "lucide-react";
import emagineLogoSvg from "@/assets/emagine-logo.svg";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] flex-col justify-between bg-primary text-primary-foreground p-10 relative overflow-hidden">
        {/* Decorative grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <Image
              src={emagineLogoSvg}
              alt="Emagine"
              width={140}
              height={24}
              className="invert brightness-200"
              priority
            />
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-3">
            <Scale className="h-8 w-8 opacity-90" />
            <h2 className="text-2xl font-semibold tracking-tight">
              Legal AI Analyzer
            </h2>
          </div>
          <p className="text-primary-foreground/70 text-[15px] leading-relaxed max-w-sm">
            AI-powered contract review, NDA triage, compliance checking, and
            risk assessment for modern legal teams.
          </p>

          <div className="grid grid-cols-2 gap-3 pt-2">
            {[
              { icon: FileText, label: "Contract Review" },
              { icon: Shield, label: "NDA Triage" },
              { icon: CheckSquare, label: "Compliance" },
              { icon: Scale, label: "Risk Assessment" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2.5 rounded-lg border border-primary-foreground/10 bg-primary-foreground/5 px-3.5 py-2.5 text-sm text-primary-foreground/80"
              >
                <Icon className="h-4 w-4 shrink-0 opacity-70" />
                {label}
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-primary-foreground/40">
          Emagine Consulting &middot; Secure &middot; Confidential
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center bg-muted/30 px-6 py-12">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </div>
  );
}
