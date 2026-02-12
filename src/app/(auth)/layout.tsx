import { EmagineLogo } from "@/components/shared/emagine-logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] flex-col justify-between bg-primary text-primary-foreground p-10 relative overflow-hidden">
        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Top logo */}
        <div className="relative z-10">
          <EmagineLogo className="h-5 text-primary-foreground/60" />
        </div>

        {/* Middle content */}
        <div className="relative z-10 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Legal AI Analyzer
          </h2>
          <p className="text-primary-foreground/60 text-[15px] leading-relaxed max-w-sm">
            AI-powered contract review, NDA triage, compliance checking, and
            risk assessment for modern legal teams.
          </p>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-xs text-primary-foreground/30">
          Emagine Consulting &middot; Secure &middot; Confidential
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center bg-muted/30 px-6 py-12">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </div>
  );
}
