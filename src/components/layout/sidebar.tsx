"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Shield,
  CheckSquare,
  AlertTriangle,
  BookOpen,
  Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contracts", label: "Contract Review", icon: FileText },
  { href: "/nda-triage", label: "NDA Triage", icon: Shield },
  { href: "/compliance", label: "Compliance", icon: CheckSquare },
  { href: "/risk-assessment", label: "Risk Assessment", icon: AlertTriangle },
  { href: "/playbook", label: "Playbook", icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      <div className="flex items-center gap-2 border-b px-6 py-4">
        <Scale className="h-6 w-6 text-primary" />
        <h1 className="text-lg font-semibold">Legal AI</h1>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4">
        <p className="text-xs text-muted-foreground">
          Legal AI Analyzer v1.0
        </p>
      </div>
    </aside>
  );
}
