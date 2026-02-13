"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ProgressSteps, Step } from "@/components/shared/progress-steps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  FileText,
  Building2,
  Search,
  ChevronRight,
  Sparkles,
  FileBarChart,
  Plus,
  X,
} from "lucide-react";
import { getCountryByCode } from "@/lib/countries";
import Link from "next/link";

interface Client {
  id: string;
  name: string;
  country: string;
  industry: string | null;
  _count: { contracts: number };
}

interface ClientContract {
  id: string;
  documentId: string;
  title: string | null;
  createdAt: string;
  document: {
    id: string;
    filename: string;
    fileType: string;
    fileSize: number;
    pageCount: number;
    createdAt: string;
  };
}

type View = "client-list" | "contract-list" | "analyzing";

const PROGRESS_STEPS: Step[] = [
  { id: "client", label: "Client", icon: Building2 },
  { id: "contract", label: "Contract", icon: FileText },
  { id: "analyze", label: "Analyze", icon: Sparkles },
  { id: "report", label: "Report", icon: FileBarChart },
];

function StartReviewWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check for re-analysis mode
  const reanalyzeContractId = searchParams?.get("contractId");
  const initialStep = searchParams?.get("step");
  const isReanalyzeMode = !!reanalyzeContractId;

  // View state
  const [view, setView] = useState<View>(
    isReanalyzeMode ? "analyzing" : "client-list"
  );
  const [currentStep, setCurrentStep] = useState(
    initialStep ? parseInt(initialStep, 10) : 0
  );

  // Data state
  const [clients, setClients] = useState<Client[]>([]);
  const [clientContracts, setClientContracts] = useState<ClientContract[]>([]);

  // Selection state
  const [selectedClientId, setSelectedClientId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Loading states
  const [loadingClients, setLoadingClients] = useState(!isReanalyzeMode);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [creating, setCreating] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  // Handle re-analysis mode
  useEffect(() => {
    if (isReanalyzeMode && reanalyzeContractId) {
      handleReanalyze(reanalyzeContractId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReanalyzeMode, reanalyzeContractId]);

  // Load clients on mount (only if not in reanalyze mode)
  useEffect(() => {
    if (!isReanalyzeMode) {
      fetch("/api/clients")
        .then((r) => r.json())
        .then((data) => setClients(Array.isArray(data) ? data : []))
        .catch(() => toast.error("Failed to load clients"))
        .finally(() => setLoadingClients(false));
    }
  }, [isReanalyzeMode]);

  // Filter clients by search query
  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    const query = searchQuery.toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(query));
  }, [clients, searchQuery]);

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  async function handleReanalyze(contractId: string) {
    setCreating(true);
    setView("analyzing");

    try {
      // First check if analysis is already in progress
      const statusRes = await fetch(`/api/contracts/${contractId}`);
      if (statusRes.ok) {
        const contract = await statusRes.json();
        
        // If already analyzing, just poll without starting a new analysis
        if (contract.status === "analyzing") {
          setIsResuming(true);
          await pollAnalysisStatus(contractId);
          return;
        }
      }

      // Start new analysis
      setIsResuming(false);
      const res = await fetch(`/api/contracts/${contractId}/analyze`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Analysis failed");
      }

      toast.success("Analysis started!");
      
      // Poll for completion
      await pollAnalysisStatus(contractId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Analysis failed"
      );
      // Navigate back to contract details on error
      router.push(`/contracts/${contractId}`);
    }
  }

  function handleClientSelect(clientId: string) {
    setSelectedClientId(clientId);
    setLoadingContracts(true);
    setView("contract-list");
    setCurrentStep(1); // Move to Contract step

    fetch(`/api/clients/${clientId}/contracts`)
      .then((r) => r.json())
      .then((data) => setClientContracts(Array.isArray(data) ? data : []))
      .catch(() => toast.error("Failed to load client contracts"))
      .finally(() => setLoadingContracts(false));
  }

  function handleBack() {
    setView("client-list");
    setSelectedClientId("");
    setClientContracts([]);
    setSearchQuery("");
    setCurrentStep(0); // Back to Client step
  }

  async function handleStartReview(contract: ClientContract) {
    if (!selectedClientId) return;

    setCreating(true);
    setView("analyzing");
    setCurrentStep(2); // Move to Analyze step

    try {
      // Step 1: Create the review
      const res = await fetch(
        `/api/clients/${selectedClientId}/contracts/${contract.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: contract.title || contract.document.filename,
            ourSide: "customer",
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start review");
      }

      const data = await res.json();
      const contractId = data.contractId;

      // Step 2: Start the analysis
      const analyzeRes = await fetch(`/api/contracts/${contractId}/analyze`, {
        method: "POST",
      });

      if (!analyzeRes.ok) {
        const err = await analyzeRes.json();
        throw new Error(err.error || "Failed to start analysis");
      }

      // Step 3: Poll for completion
      await pollAnalysisStatus(contractId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
      setView("contract-list");
      setCurrentStep(1);
      setCreating(false);
    }
  }

  async function pollAnalysisStatus(contractId: string) {
    const maxAttempts = 60; // 2 minutes max
    let attempts = 0;

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/contracts/${contractId}`);
        if (!res.ok) throw new Error("Failed to check status");

        const contract = await res.json();

        // Check if analysis is complete
        if (contract.status === "completed" && contract.analysis) {
          // Move to Report step
          setCurrentStep(3);
          toast.success("Analysis complete!");
          
          // Wait a moment to show the complete state
          await new Promise((resolve) => setTimeout(resolve, 1000));
          
          // Navigate to contract details with completed flag
          router.push(`/contracts/${contractId}?completed=true`);
          return;
        }

        // Check if there was an error
        if (contract.status === "error") {
          throw new Error("Analysis failed");
        }

        // Continue polling if still analyzing
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Poll every 2 seconds
          return poll();
        } else {
          throw new Error("Analysis timed out");
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Analysis failed"
        );
        setView("contract-list");
        setCurrentStep(1);
        setCreating(false);
      }
    };

    await poll();
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div>
      <PageHeader
        title="AI Analysis"
        description="Intelligent contract comparison & risk detection"
      />

      {/* Progress Steps */}
      <div className="border-b bg-muted/30">
        <div className="mx-auto max-w-4xl">
          <ProgressSteps steps={PROGRESS_STEPS} currentStep={currentStep} />
        </div>
      </div>

      <div className="mx-auto max-w-4xl p-8">
        {/* Client List View */}
        {view === "client-list" && (
          <Card>
            <CardContent className="p-6">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Building2 className="h-5 w-5" />
                  Select Client
                </h2>
                <Link href="/clients">
                  <Button variant="outline" size="sm" className="gap-1">
                    <Plus className="h-4 w-4" />
                    New Client
                  </Button>
                </Link>
              </div>

              {/* Search Input */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Client List */}
              {loadingClients ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading clients...
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Building2 className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    {searchQuery
                      ? "No clients match your search"
                      : "No clients found. Create a client first to start a review."}
                  </p>
                  {!searchQuery && (
                    <Link href="/clients">
                      <Button variant="outline" className="mt-4">
                        Go to Clients
                      </Button>
                    </Link>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {filteredClients.map((client) => {
                      const country = getCountryByCode(client.country);
                      return (
                        <div
                          key={client.id}
                          onClick={() => handleClientSelect(client.id)}
                          className="group cursor-pointer rounded-lg border bg-card p-4 transition-all hover:shadow-md"
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-3xl">
                              {country?.flag || "🏢"}
                            </span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">{client.name}</h3>
                                {client.industry && (
                                  <Badge
                                    variant="outline"
                                    className="text-xs uppercase"
                                  >
                                    {client.industry}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {client._count.contracts} document
                                {client._count.contracts !== 1 ? "s" : ""}
                              </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-center text-xs text-muted-foreground">
                    {filteredClients.length} client
                    {filteredClients.length !== 1 ? "s" : ""} total
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Contract List View */}
        {view === "contract-list" && (
          <Card>
            <CardContent className="p-6">
              <div className="mb-6 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="gap-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                {selectedClient && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">·</span>
                    <span className="text-sm font-medium">
                      {selectedClient.name}
                    </span>
                  </div>
                )}
              </div>

              {loadingContracts ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading contracts...
                </div>
              ) : clientContracts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    This client has no contracts yet.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Go to the client page to upload contracts first.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => router.push(`/clients/${selectedClientId}`)}
                  >
                    Go to Client Page
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {clientContracts.map((contract) => (
                    <div
                      key={contract.id}
                      className="flex items-center justify-between rounded-lg border bg-card p-4"
                    >
                      <div className="flex items-start gap-3">
                        <FileText className="mt-1 h-5 w-5 text-muted-foreground" />
                        <div>
                          <h3 className="font-medium">
                            {contract.title || contract.document.filename}
                          </h3>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge
                              variant="outline"
                              className="text-xs uppercase"
                            >
                              {contract.document.fileType}
                            </Badge>
                            <span>·</span>
                            <span>
                              {formatFileSize(contract.document.fileSize)}
                            </span>
                            <span>·</span>
                            <span>{contract.document.pageCount} pages</span>
                            <span>·</span>
                            <span>
                              Uploaded{" "}
                              {new Date(
                                contract.createdAt
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleStartReview(contract)}
                        disabled={creating}
                        size="sm"
                      >
                        Start Review
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Analyzing View */}
        {view === "analyzing" && (
          <Card>
            <CardContent className="p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <Loader2 className="mb-4 h-12 w-12 animate-spin text-primary" />
                <h3 className="mb-2 text-lg font-semibold">
                  {isResuming
                    ? "Analysis in progress..."
                    : isReanalyzeMode
                      ? "Re-analyzing contract..."
                      : "Analyzing contract..."}
                </h3>
                <p className="text-sm text-muted-foreground">
                  This may take up to a few minutes depending on contract length
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function StartReviewPage() {
  return (
    <Suspense fallback={
      <div>
        <PageHeader
          title="AI Analysis"
          description="Intelligent contract comparison & risk detection"
        />
        <div className="mx-auto max-w-4xl p-8">
          <Card>
            <CardContent className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        </div>
      </div>
    }>
      <StartReviewWizard />
    </Suspense>
  );
}
