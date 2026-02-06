"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/shared/severity-badge";
import { Plus, FileText } from "lucide-react";

interface ContractRow {
  id: string;
  title: string;
  ourSide: string;
  status: string;
  createdAt: string;
  document: { filename: string };
  analysis?: {
    overallRisk: string;
    greenCount: number;
    yellowCount: number;
    redCount: number;
  };
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/contracts")
      .then((r) => r.json())
      .then((data) => setContracts(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Contract Review"
        description="Upload and analyze contracts with AI-powered clause-by-clause review"
        actions={
          <Link href="/contracts/upload">
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> New Review
            </Button>
          </Link>
        }
      />
      <div className="p-8">
        {loading ? (
          <div className="text-center text-muted-foreground py-12">Loading...</div>
        ) : contracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">No contracts yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a contract to get started with AI analysis.
            </p>
            <Link href="/contracts/upload" className="mt-4">
              <Button>Upload Contract</Button>
            </Link>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Our Side</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Findings</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell>
                    <Link
                      href={`/contracts/${contract.id}`}
                      className="font-medium hover:underline"
                    >
                      {contract.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {contract.document.filename}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{contract.ourSide}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        contract.status === "completed"
                          ? "default"
                          : contract.status === "error"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {contract.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {contract.analysis && (
                      <div className="flex gap-1">
                        {contract.analysis.redCount > 0 && (
                          <SeverityBadge severity="RED" size="sm" />
                        )}
                        {contract.analysis.yellowCount > 0 && (
                          <SeverityBadge severity="YELLOW" size="sm" />
                        )}
                        {contract.analysis.greenCount > 0 && (
                          <SeverityBadge severity="GREEN" size="sm" />
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(contract.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
