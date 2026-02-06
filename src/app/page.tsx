"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Shield,
  CheckSquare,
  AlertTriangle,
  ArrowRight,
  Scale,
} from "lucide-react";

interface DashboardStats {
  contracts: number;
  ndas: number;
  compliance: number;
  risks: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    contracts: 0,
    ndas: 0,
    compliance: 0,
    risks: 0,
  });

  useEffect(() => {
    async function loadStats() {
      try {
        const [contracts, ndas, compliance, risks] = await Promise.all([
          fetch("/api/contracts").then((r) => r.json()),
          fetch("/api/nda-triage").then((r) => r.json()),
          fetch("/api/compliance").then((r) => r.json()),
          fetch("/api/risk-assessment").then((r) => r.json()),
        ]);
        setStats({
          contracts: Array.isArray(contracts) ? contracts.length : 0,
          ndas: Array.isArray(ndas) ? ndas.length : 0,
          compliance: Array.isArray(compliance) ? compliance.length : 0,
          risks: Array.isArray(risks) ? risks.length : 0,
        });
      } catch {
        // Stats will stay at 0
      }
    }
    loadStats();
  }, []);

  const features = [
    {
      title: "Contract Review",
      description:
        "Upload contracts for clause-by-clause analysis with GREEN/YELLOW/RED flags and redline suggestions.",
      icon: FileText,
      href: "/contracts",
      stat: stats.contracts,
      statLabel: "contracts analyzed",
      color: "text-blue-600",
    },
    {
      title: "NDA Triage",
      description:
        "Rapidly screen incoming NDAs against standard criteria and classify for routing.",
      icon: Shield,
      href: "/nda-triage",
      stat: stats.ndas,
      statLabel: "NDAs triaged",
      color: "text-emerald-600",
    },
    {
      title: "Compliance Check",
      description:
        "Check contracts against GDPR, CCPA, and other regulatory requirements.",
      icon: CheckSquare,
      href: "/compliance",
      stat: stats.compliance,
      statLabel: "checks completed",
      color: "text-purple-600",
    },
    {
      title: "Risk Assessment",
      description:
        "Evaluate legal risks using a severity-by-likelihood framework with mitigation options.",
      icon: AlertTriangle,
      href: "/risk-assessment",
      stat: stats.risks,
      statLabel: "assessments done",
      color: "text-orange-600",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Legal AI Analyzer"
        description="AI-powered contract review, NDA triage, compliance checking, and risk assessment"
      />
      <div className="p-8">
        <div className="mb-8 flex items-center gap-4 rounded-lg border bg-gradient-to-r from-primary/5 to-primary/10 p-6">
          <Scale className="h-10 w-10 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Welcome to Legal AI</h2>
            <p className="text-sm text-muted-foreground">
              Upload a contract, NDA, or legal document to get started with
              AI-powered analysis. All analysis is powered by Claude and the
              Anthropic legal skills framework.
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {features.map((feature) => (
            <Card key={feature.href} className="group hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-start justify-between">
                <div className="flex items-center gap-3">
                  <feature.icon className={`h-5 w-5 ${feature.color}`} />
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                </div>
                <span className="text-2xl font-bold text-muted-foreground">
                  {feature.stat}
                </span>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                  {feature.description}
                </p>
                <Link href={feature.href}>
                  <Button variant="outline" size="sm" className="gap-2">
                    Get started <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
