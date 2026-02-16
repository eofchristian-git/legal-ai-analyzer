"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileDropzone } from "@/components/shared/file-dropzone";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Upload,
  MoreHorizontal,
  FileText,
  Play,
  Mail,
  Phone,
  User,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { COUNTRIES, getCountryByCode } from "@/lib/countries";
import { INDUSTRIES } from "@/lib/industries";

interface ClientContractRow {
  id: string;
  documentId: string;
  title: string | null;
  uploadedByName: string | null;
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

interface ClientDetail {
  id: string;
  name: string;
  country: string;
  industry: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  contracts: ClientContractRow[];
}

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editIndustry, setEditIndustry] = useState("");
  const [editContactPerson, setEditContactPerson] = useState("");
  const [editContactEmail, setEditContactEmail] = useState("");
  const [editContactPhone, setEditContactPhone] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Upload dialog state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploading, setUploading] = useState(false);

  // Delete contract dialog state
  const [deleteContractDialogOpen, setDeleteContractDialogOpen] = useState(false);
  const [deletingContract, setDeletingContract] = useState<ClientContractRow | null>(null);
  const [deletingContractLoading, setDeletingContractLoading] = useState(false);

  // Delete client dialog state
  const [deleteClientDialogOpen, setDeleteClientDialogOpen] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);

  // Start review dialog state
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewingContract, setReviewingContract] = useState<ClientContractRow | null>(null);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewOurSide, setReviewOurSide] = useState("");
  const [startingReview, setStartingReview] = useState(false);

  const loadClient = useCallback(() => {
    fetch(`/api/clients/${clientId}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setClient(data);
      })
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => {
    loadClient();
  }, [loadClient]);

  // Edit handlers
  function openEditDialog() {
    if (!client) return;
    setEditName(client.name);
    setEditCountry(client.country);
    setEditIndustry(client.industry || "");
    setEditContactPerson(client.contactPerson || "");
    setEditContactEmail(client.contactEmail || "");
    setEditContactPhone(client.contactPhone || "");
    setEditNotes(client.notes || "");
    setEditDialogOpen(true);
  }

  async function handleSaveEdit() {
    if (!client) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          country: editCountry,
          industry: editIndustry || null,
          contactPerson: editContactPerson.trim() || null,
          contactEmail: editContactEmail.trim() || null,
          contactPhone: editContactPhone.trim() || null,
          notes: editNotes.trim() || null,
        }),
      });
      if (res.ok) {
        toast.success("Client updated");
        setClient((prev) =>
          prev
            ? {
                ...prev,
                name: editName.trim(),
                country: editCountry,
                industry: editIndustry || null,
                contactPerson: editContactPerson.trim() || null,
                contactEmail: editContactEmail.trim() || null,
                contactPhone: editContactPhone.trim() || null,
                notes: editNotes.trim() || null,
              }
            : prev
        );
        setEditDialogOpen(false);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update client");
      }
    } catch {
      toast.error("Failed to update client");
    } finally {
      setSaving(false);
    }
  }

  // Upload contract handlers
  async function handleUploadContract() {
    if (!selectedFile) return;
    setUploading(true);
    try {
      // Step 1: Upload file
      const formData = new FormData();
      formData.append("file", selectedFile);
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        toast.error(err.error || "Failed to upload file");
        return;
      }
      const doc = await uploadRes.json();

      // Step 2: Attach to client
      const attachRes = await fetch(`/api/clients/${clientId}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.id,
          title: uploadTitle.trim() || undefined,
        }),
      });
      if (attachRes.ok) {
        toast.success("Contract uploaded successfully");
        loadClient(); // Reload to get full data
        setUploadDialogOpen(false);
        setSelectedFile(null);
        setUploadTitle("");
      } else {
        const err = await attachRes.json();
        toast.error(err.error || "Failed to attach contract");
      }
    } catch {
      toast.error("Failed to upload contract");
    } finally {
      setUploading(false);
    }
  }

  // Delete contract handlers
  function openDeleteContractDialog(contract: ClientContractRow) {
    setDeletingContract(contract);
    setDeleteContractDialogOpen(true);
  }

  async function handleDeleteContract() {
    if (!deletingContract) return;
    setDeletingContractLoading(true);
    try {
      const res = await fetch(
        `/api/clients/${clientId}/contracts/${deletingContract.id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        toast.success("Contract removed");
        setClient((prev) =>
          prev
            ? {
                ...prev,
                contracts: prev.contracts.filter(
                  (c) => c.id !== deletingContract.id
                ),
              }
            : prev
        );
        setDeleteContractDialogOpen(false);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to remove contract");
      }
    } catch {
      toast.error("Failed to remove contract");
    } finally {
      setDeletingContractLoading(false);
    }
  }

  // Delete client handlers
  async function handleDeleteClient() {
    setDeletingClient(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Client archived");
        router.push("/clients");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete client");
      }
    } catch {
      toast.error("Failed to delete client");
    } finally {
      setDeletingClient(false);
    }
  }

  // Start review handlers
  function openReviewDialog(contract: ClientContractRow) {
    setReviewingContract(contract);
    setReviewTitle("");
    setReviewOurSide("");
    setReviewDialogOpen(true);
  }

  async function handleStartReview() {
    if (!reviewingContract || !reviewTitle.trim() || !reviewOurSide) return;
    setStartingReview(true);
    try {
      const res = await fetch(
        `/api/clients/${clientId}/contracts/${reviewingContract.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: reviewTitle.trim(),
            ourSide: reviewOurSide,
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        toast.success("Review created");
        router.push(`/contracts/${data.contractId}`);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to start review");
      }
    } catch {
      toast.error("Failed to start review");
    } finally {
      setStartingReview(false);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (loading) {
    return (
      <div className="text-center text-muted-foreground py-12">Loading...</div>
    );
  }

  if (notFound || !client) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium">Client not found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          This client may have been deleted or does not exist.
        </p>
        <Link href="/clients" className="mt-4">
          <Button variant="outline">Back to Clients</Button>
        </Link>
      </div>
    );
  }

  const country = getCountryByCode(client.country);

  return (
    <div>
      <PageHeader
        title={client.name}
        description={
          country
            ? `${country.flag} ${country.name}${client.industry ? ` · ${client.industry}` : ""}`
            : client.country
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={openEditDialog}>
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteClientDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        {/* Back link */}
        <Link
          href="/clients"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Clients
        </Link>

        {/* Client Details Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Client Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Contact Person</p>
                <p className="text-sm flex items-center gap-1.5">
                  {client.contactPerson ? (
                    <>
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {client.contactPerson}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Email</p>
                <p className="text-sm flex items-center gap-1.5">
                  {client.contactEmail ? (
                    <>
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <a
                        href={`mailto:${client.contactEmail}`}
                        className="hover:underline text-primary"
                      >
                        {client.contactEmail}
                      </a>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Phone</p>
                <p className="text-sm flex items-center gap-1.5">
                  {client.contactPhone ? (
                    <>
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <a
                        href={`tel:${client.contactPhone}`}
                        className="hover:underline text-primary"
                      >
                        {client.contactPhone}
                      </a>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Industry</p>
                <p className="text-sm">
                  {client.industry ? (
                    <Badge variant="secondary">{client.industry}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
              </div>
              {client.notes && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{client.notes}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Created By</p>
                <p className="text-sm">
                  {client.createdByName ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Created</p>
                <p className="text-sm">
                  {new Date(client.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Attached Contracts */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Attached Contracts ({client.contracts.length})
            </h2>
            <Button
              size="sm"
              className="gap-1"
              onClick={() => setUploadDialogOpen(true)}
            >
              <Upload className="h-4 w-4" />
              Upload Contract
            </Button>
          </div>

          {client.contracts.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center text-center">
                  <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No contracts attached yet. Upload a contract to get started.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Pages</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {client.contracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">
                          {contract.title || contract.document.filename}
                        </p>
                        {contract.title && (
                          <p className="text-xs text-muted-foreground">
                            {contract.document.filename}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase text-xs">
                        {contract.document.fileType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatFileSize(contract.document.fileSize)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {contract.document.pageCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(contract.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => openReviewDialog(contract)}
                          >
                            <Play className="mr-2 h-4 w-4" />
                            Start Review
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => openDeleteContractDialog(contract)}
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
      </div>

      {/* Edit Client Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>
              Update client information.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-country">
                Country <span className="text-destructive">*</span>
              </Label>
              <Select value={editCountry} onValueChange={setEditCountry}>
                <SelectTrigger id="edit-country">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.flag} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-industry">Industry</Label>
              <Select
                value={editIndustry || "__none__"}
                onValueChange={(v) => setEditIndustry(v === "__none__" ? "" : v)}
              >
                <SelectTrigger id="edit-industry">
                  <SelectValue placeholder="Select industry (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind} value={ind}>
                      {ind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-contact-person">Contact Person</Label>
                <Input
                  id="edit-contact-person"
                  value={editContactPerson}
                  onChange={(e) => setEditContactPerson(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-contact-email">Contact Email</Label>
                <Input
                  id="edit-contact-email"
                  type="email"
                  value={editContactEmail}
                  onChange={(e) => setEditContactEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-contact-phone">Contact Phone</Label>
              <Input
                id="edit-contact-phone"
                value={editContactPhone}
                onChange={(e) => setEditContactPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={saving || !editName.trim() || !editCountry}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Contract Dialog */}
      <Dialog
        open={uploadDialogOpen}
        onOpenChange={(open) => {
          setUploadDialogOpen(open);
          if (!open) {
            setSelectedFile(null);
            setUploadTitle("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Contract</DialogTitle>
            <DialogDescription>
              Attach a contract document to {client.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FileDropzone
              onFileSelect={setSelectedFile}
              selectedFile={selectedFile}
              onClear={() => setSelectedFile(null)}
              accept={{
                "application/pdf": [".pdf"],
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                  [".docx"],
              }}
            />
            <div className="space-y-2">
              <Label htmlFor="upload-title">
                Title <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="upload-title"
                placeholder="Display name for this contract"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUploadDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUploadContract}
              disabled={uploading || !selectedFile}
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Contract Dialog */}
      <Dialog
        open={deleteContractDialogOpen}
        onOpenChange={setDeleteContractDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Contract</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-semibold text-foreground">
                {deletingContract?.title ||
                  deletingContract?.document.filename}
              </span>{" "}
              from this client? The document will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteContractDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteContract}
              disabled={deletingContractLoading}
            >
              {deletingContractLoading ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Client Dialog */}
      <Dialog
        open={deleteClientDialogOpen}
        onOpenChange={setDeleteClientDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Client</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {client.name}
              </span>
              ? The client will be archived and can be restored later. Existing
              contract reviews will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteClientDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteClient}
              disabled={deletingClient}
            >
              {deletingClient ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start Review Dialog */}
      <Dialog
        open={reviewDialogOpen}
        onOpenChange={(open) => {
          setReviewDialogOpen(open);
          if (!open) {
            setReviewTitle("");
            setReviewOurSide("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Contract Review</DialogTitle>
            <DialogDescription>
              Create a new contract review from{" "}
              <span className="font-semibold text-foreground">
                {reviewingContract?.title ||
                  reviewingContract?.document.filename}
              </span>
              . A copy of the document will be created for the review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="review-title">
                Review Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="review-title"
                placeholder="e.g., Acme MSA Review - Feb 2026"
                value={reviewTitle}
                onChange={(e) => setReviewTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-ourside">
                Our Side <span className="text-destructive">*</span>
              </Label>
              <Select value={reviewOurSide} onValueChange={setReviewOurSide}>
                <SelectTrigger id="review-ourside">
                  <SelectValue placeholder="Select your role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="licensor">Licensor</SelectItem>
                  <SelectItem value="licensee">Licensee</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleStartReview}
              disabled={
                startingReview || !reviewTitle.trim() || !reviewOurSide
              }
            >
              {startingReview ? "Starting..." : "Start Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
