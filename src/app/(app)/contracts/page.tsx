"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, FileText, Lock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getCountryByCode } from "@/lib/countries";

interface ContractRow {
  id: string;
  title: string;
  ourSide: string;
  status: string;
  createdAt: string;
  createdByName: string | null;
  clientId: string | null;
  clientName: string | null;
  clientCountry: string | null;
  document: { filename: string };
  analysis?: {
    overallRisk: string;
    greenCount: number;
    yellowCount: number;
    redCount: number;
    finalized: boolean;
    totalFindings: number;
    triagedCount: number;
  };
}

export default function ContractsPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<ContractRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editOurSide, setEditOurSide] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingContract, setDeletingContract] = useState<ContractRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadContracts();
  }, []);

  function loadContracts() {
    fetch("/api/contracts")
      .then((r) => r.json())
      .then((data) => setContracts(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }

  function openEditDialog(contract: ContractRow) {
    setEditingContract(contract);
    setEditTitle(contract.title);
    setEditOurSide(contract.ourSide);
    setEditDialogOpen(true);
  }

  async function handleSaveEdit() {
    if (!editingContract) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/contracts/${editingContract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, ourSide: editOurSide }),
      });
      if (res.ok) {
        toast.success("Contract updated successfully");
        setContracts((prev) =>
          prev.map((c) =>
            c.id === editingContract.id
              ? { ...c, title: editTitle, ourSide: editOurSide }
              : c
          )
        );
        setEditDialogOpen(false);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update contract");
      }
    } catch {
      toast.error("Failed to update contract");
    } finally {
      setSaving(false);
    }
  }

  function openDeleteDialog(contract: ContractRow) {
    setDeletingContract(contract);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!deletingContract) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/contracts/${deletingContract.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Contract deleted");
        setContracts((prev) => prev.filter((c) => c.id !== deletingContract.id));
        setDeleteDialogOpen(false);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete contract");
      }
    } catch {
      toast.error("Failed to delete contract");
    } finally {
      setDeleting(false);
    }
  }

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
                <TableHead>Client</TableHead>
                <TableHead>Our Side</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Triage</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[50px]"></TableHead>
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
                  <TableCell>
                    {contract.clientId && contract.clientName ? (
                      <Link
                        href={`/clients/${contract.clientId}`}
                        className="text-sm hover:underline flex items-center gap-1.5"
                      >
                        {contract.clientCountry && (
                          <span>{getCountryByCode(contract.clientCountry)?.flag}</span>
                        )}
                        <span>{contract.clientName}</span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
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
                      contract.analysis.finalized ? (
                        <Badge variant="outline" className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                          <Lock className="h-3 w-3" />
                          Finalized
                        </Badge>
                      ) : contract.analysis.totalFindings > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {contract.analysis.triagedCount}/{contract.analysis.totalFindings} triaged
                        </span>
                      ) : null
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {contract.createdByName ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(contract.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(contract)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => openDeleteDialog(contract)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contract Review</DialogTitle>
            <DialogDescription>
              Update the contract review details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-ourside">Our Side</Label>
              <Input
                id="edit-ourside"
                value={editOurSide}
                onChange={(e) => setEditOurSide(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editTitle.trim() || !editOurSide.trim()}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contract Review</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">{deletingContract?.title}</span>?
              This action cannot be undone and will remove all associated analyses and findings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
