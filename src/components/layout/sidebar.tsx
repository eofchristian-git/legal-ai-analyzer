"use client";

import {
  LayoutDashboard,
  FileText,
  Shield,
  Scale,
  AlertTriangle,
  BookOpen,
  Users,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmagineLogo } from "@/components/shared/emagine-logo";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contracts", label: "Contract Review", icon: FileText },
  { href: "/nda-triage", label: "NDA Triage", icon: Shield },
  { href: "/compliance", label: "Compliance", icon: Scale },
  { href: "/risk-assessment", label: "Risk Assessment", icon: AlertTriangle },
  { href: "/playbook", label: "Playbook", icon: BookOpen },
];

const adminNavItems = [
  { href: "/admin/users", label: "User Management", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  return (
    <aside className="flex h-screen w-56 flex-col bg-sidebar shrink-0 border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center px-5 py-4 border-b border-sidebar-border">
        <EmagineLogo className="h-4 text-sidebar-foreground" />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-2 mt-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium transition-all",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className={cn("h-3.5 w-3.5", isActive && "text-sidebar-primary")} />
              {item.label}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <div className="my-2 border-t border-sidebar-border" />
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
              Admin
            </p>
            {adminNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium transition-all",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className={cn("h-3.5 w-3.5", isActive && "text-sidebar-primary")} />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-sidebar-border p-3 space-y-2">
        {session?.user && (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-sidebar-accent-foreground">{session.user.name}</p>
              <p className="truncate text-[10px] text-sidebar-foreground/60">{session.user.email}</p>
            </div>
            <Badge variant="outline" className="ml-2 shrink-0 capitalize text-[10px] border-sidebar-border text-sidebar-foreground">
              {session.user.role}
            </Badge>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground/60 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent text-xs h-7"
          onClick={() => signOut({ redirectTo: "/login" })}
        >
          <LogOut className="h-3 w-3" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
