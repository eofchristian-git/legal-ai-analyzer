"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, ArrowLeft, FileText, Building2 } from "lucide-react";
import { getCountryByCode } from "@/lib/countries";

interface Client {
  id: string;
  name: string;
  country: string;
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

export default function StartReviewPage() {
  const router = useRouter();
  
  // Step state
  const [step, setStep] = useState<1 | 2>(1);
  
  // Data state
  const [clients, setClients] = useState<Client[]>([]);
  const [clientContracts, setClientContracts] = useState<ClientContract[]>([]);
  
  // Selection state
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedContractId, setSelectedContractId] = useState("");
  
  // Loading states
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [creating, setCreating] = useState(false);

  // Load clients on mount
  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .catch(() => toast.error("Failed to load clients"))
      .finally(() => setLoadingClients(false));
  }, []);

  // Load client contracts when client selected
  useEffect(() => {
    if (!selectedClientId) {
      setClientContracts([]);
      return;
    }

    setLoadingContracts(true);
    fetch(`/api/clients/${selectedClientId}/contracts`)
      .then((r) => r.json())
      .then((data) => setClientContracts(Array.isArray(data) ? data : []))
      .catch(() => toast.error("Failed to load client contracts"))
      .finally(() => setLoadingContracts(false));
  }, [selectedClientId]);

  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const selectedContract = clientContracts.find((c) => c.id === selectedContractId);

  function handleNext() {
    if (!selectedClientId) return;
    setStep(2);
  }

  function handleBack() {
    setStep(1);
    setSelectedContractId("");
  }

  async function handleStartReview() {
    if (!selectedClientId || !selectedContractId || !selectedContract) return;

    setCreating(true);
    try {
      const res = await fetch(
        `/api/clients/${selectedClientId}/contracts/${selectedContractId}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: selectedContract.title || selectedContract.document.filename,
            ourSide: "customer",
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start review");
      }

      const data = await res.json();
      toast.success("Review created — starting analysis…");
      router.push(`/contracts/${data.contractId}?autoAnalyze=true`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
      setCreating(false);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div>
      <PageHeader
        title="Start Contract Review"
        description="Select a client and one of their contracts to create a new review"
      />
      <div className="mx-auto max-w-2xl p-8">
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Step 1: Select Client</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingClients ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading clients...
                </div>
              ) : clients.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Building2 className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No clients found. Create a client first to start a review.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => router.push("/clients")}
                  >
                    Go to Clients
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="client-select">
                      Client <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={selectedClientId}
                      onValueChange={setSelectedClientId}
                    >
                      <SelectTrigger id="client-select">
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((client) => {
                          const country = getCountryByCode(client.country);
                          return (
                            <SelectItem key={client.id} value={client.id}>
                              <span className="flex items-center gap-2">
                                {country && <span>{country.flag}</span>}
                                <span>{client.name}</span>
                                <Badge variant="secondary" className="ml-1 text-xs">
                                  {client._count.contracts}{" "}
                                  {client._count.contracts === 1 ? "contract" : "contracts"}
                                </Badge>
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={handleNext}
                    disabled={!selectedClientId}
                    className="w-full"
                  >
                    Next
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span>Step 2: Select Contract</span>
                {selectedClient && (
                  <span className="text-sm font-normal text-muted-foreground">
                    for {selectedClient.name}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingContracts ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading contracts...
                </div>
              ) : clientContracts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground mb-2">
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
                <>
                  <div className="space-y-2">
                    <Label htmlFor="contract-select">
                      Contract <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={selectedContractId}
                      onValueChange={setSelectedContractId}
                    >
                      <SelectTrigger id="contract-select">
                        <SelectValue placeholder="Select a contract" />
                      </SelectTrigger>
                      <SelectContent>
                        {clientContracts.map((contract) => (
                          <SelectItem key={contract.id} value={contract.id}>
                            <div className="flex flex-col items-start py-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {contract.title || contract.document.filename}
                                </span>
                                <Badge variant="outline" className="uppercase text-xs">
                                  {contract.document.fileType}
                                </Badge>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatFileSize(contract.document.fileSize)} · {contract.document.pageCount} pages · Uploaded {new Date(contract.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleBack}
                      disabled={creating}
                      className="gap-1"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      onClick={handleStartReview}
                      disabled={!selectedContractId || creating}
                      className="flex-1"
                    >
                      {creating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating Review...
                        </>
                      ) : (
                        "Start Review"
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
