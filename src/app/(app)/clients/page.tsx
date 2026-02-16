"use client";

import { useEffect, useState, useMemo } from "react";
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
import {
  Plus,
  Building2,
  MoreHorizontal,
  Trash2,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { COUNTRIES, getCountryByCode } from "@/lib/countries";
import { INDUSTRIES } from "@/lib/industries";

interface ClientRow {
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
  _count: { contracts: number };
}

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("all");

  // New client dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [newContactPerson, setNewContactPerson] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingClient, setDeletingClient] = useState<ClientRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadClients();
  }, []);

  function loadClients() {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }

  // Filtered clients
  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const matchesSearch =
        !searchQuery ||
        client.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCountry =
        countryFilter === "all" || client.country === countryFilter;
      return matchesSearch && matchesCountry;
    });
  }, [clients, searchQuery, countryFilter]);

  // Countries that have clients (for filter dropdown)
  const clientCountries = useMemo(() => {
    const codes = [...new Set(clients.map((c) => c.country))];
    return codes
      .map((code) => getCountryByCode(code))
      .filter(Boolean)
      .sort((a, b) => a!.name.localeCompare(b!.name));
  }, [clients]);

  const hasActiveFilters = searchQuery || countryFilter !== "all";

  function resetForm() {
    setNewName("");
    setNewCountry("");
    setNewIndustry("");
    setNewContactPerson("");
    setNewContactEmail("");
    setNewContactPhone("");
    setNewNotes("");
  }

  async function handleCreateClient() {
    if (!newName.trim() || !newCountry) return;
    setCreating(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          country: newCountry,
          industry: newIndustry || undefined,
          contactPerson: newContactPerson.trim() || undefined,
          contactEmail: newContactEmail.trim() || undefined,
          contactPhone: newContactPhone.trim() || undefined,
          notes: newNotes.trim() || undefined,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        // Optimistically add to list
        setClients((prev) => [
          {
            ...created,
            createdByName: null, // Will be updated on next full load
            _count: { contracts: 0 },
          },
          ...prev,
        ]);
        toast.success("Client created successfully");
        setCreateDialogOpen(false);
        resetForm();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to create client");
      }
    } catch {
      toast.error("Failed to create client");
    } finally {
      setCreating(false);
    }
  }

  function openDeleteDialog(client: ClientRow) {
    setDeletingClient(client);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!deletingClient) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/clients/${deletingClient.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Client archived");
        setClients((prev) => prev.filter((c) => c.id !== deletingClient.id));
        setDeleteDialogOpen(false);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete client");
      }
    } catch {
      toast.error("Failed to delete client");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Manage client profiles and attached contract documents"
        actions={
          <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4" /> New Client
          </Button>
        }
      />
      <div className="p-8">
        {loading ? (
          <div className="text-center text-muted-foreground py-12">
            Loading...
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">No clients yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first client to start managing contracts.
            </p>
            <Button
              className="mt-4"
              onClick={() => setCreateDialogOpen(true)}
            >
              New Client
            </Button>
          </div>
        ) : (
          <>
            {/* Search and Filters */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={countryFilter}
                onValueChange={setCountryFilter}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Countries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  {clientCountries.map((country) =>
                    country ? (
                      <SelectItem key={country.code} value={country.code}>
                        {country.flag} {country.name}
                      </SelectItem>
                    ) : null
                  )}
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setCountryFilter("all");
                  }}
                  className="gap-1"
                >
                  <X className="h-3 w-3" />
                  Clear filters
                </Button>
              )}
            </div>

            {filteredClients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">
                  No clients match your filters
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try adjusting your search or filter criteria.
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setSearchQuery("");
                    setCountryFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Contracts</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((client) => {
                    const country = getCountryByCode(client.country);
                    return (
                      <TableRow
                        key={client.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/clients/${client.id}`)}
                      >
                        <TableCell>
                          <Link
                            href={`/clients/${client.id}`}
                            className="font-medium hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {client.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {country ? (
                            <span className="flex items-center gap-1.5">
                              <span>{country.flag}</span>
                              <span className="text-sm">{country.name}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {client.country}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {client.industry ? (
                            <Badge variant="secondary">
                              {client.industry}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {client._count.contracts}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(client.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDeleteDialog(client);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </div>

      {/* New Client Dialog */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Client</DialogTitle>
            <DialogDescription>
              Add a new client to manage their contracts and reviews.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="client-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="client-name"
                placeholder="Client name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-country">
                Country <span className="text-destructive">*</span>
              </Label>
              <Select value={newCountry} onValueChange={setNewCountry}>
                <SelectTrigger id="client-country">
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
              <Label htmlFor="client-industry">Industry</Label>
              <Select value={newIndustry} onValueChange={setNewIndustry}>
                <SelectTrigger id="client-industry">
                  <SelectValue placeholder="Select industry (optional)" />
                </SelectTrigger>
                <SelectContent>
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
                <Label htmlFor="client-contact-person">Contact Person</Label>
                <Input
                  id="client-contact-person"
                  placeholder="Full name"
                  value={newContactPerson}
                  onChange={(e) => setNewContactPerson(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-contact-email">Contact Email</Label>
                <Input
                  id="client-contact-email"
                  type="email"
                  placeholder="email@example.com"
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-contact-phone">Contact Phone</Label>
              <Input
                id="client-contact-phone"
                placeholder="+1-555-0100"
                value={newContactPhone}
                onChange={(e) => setNewContactPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-notes">Notes</Label>
              <Textarea
                id="client-notes"
                placeholder="Additional notes about this client..."
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateClient}
              disabled={creating || !newName.trim() || !newCountry}
            >
              {creating ? "Creating..." : "Create Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Client</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {deletingClient?.name}
              </span>
              ? The client will be archived and can be restored later. Existing
              contract reviews will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
