import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrUnauthorized } from "@/lib/auth-utils";
import { COUNTRIES } from "@/lib/countries";
import { INDUSTRIES } from "@/lib/industries";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await getSessionOrUnauthorized();
    if (error) return error;

    const { id } = await params;

    const client = await db.client.findFirst({
      where: { id, deleted: false },
      include: {
        createdByUser: { select: { id: true, name: true } },
        contracts: {
          include: {
            document: {
              select: {
                id: true,
                filename: true,
                fileType: true,
                fileSize: true,
                pageCount: true,
                createdAt: true,
              },
            },
            uploadedByUser: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    const result = {
      ...client,
      createdByName: client.createdByUser?.name ?? null,
      createdByUser: undefined,
      contracts: client.contracts.map((c) => ({
        ...c,
        uploadedByName: c.uploadedByUser?.name ?? null,
        uploadedByUser: undefined,
      })),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to get client:", error);
    return NextResponse.json(
      { error: "Failed to get client" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await getSessionOrUnauthorized();
    if (error) return error;

    const { id } = await params;
    const body = await req.json();

    // Check client exists and is not soft-deleted
    const existing = await db.client.findFirst({
      where: { id, deleted: false },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    // Build update data — only include provided fields
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (!body.name?.trim()) {
        return NextResponse.json(
          { error: "Name cannot be empty" },
          { status: 400 }
        );
      }
      data.name = body.name.trim();
    }

    if (body.country !== undefined) {
      const validCountry = COUNTRIES.find((c) => c.code === body.country);
      if (!validCountry) {
        return NextResponse.json(
          { error: "Invalid country code" },
          { status: 400 }
        );
      }
      data.country = body.country;
    }

    if (body.industry !== undefined) {
      if (body.industry && !INDUSTRIES.includes(body.industry)) {
        return NextResponse.json(
          { error: "Invalid industry" },
          { status: 400 }
        );
      }
      data.industry = body.industry || null;
    }

    if (body.contactPerson !== undefined) {
      data.contactPerson = body.contactPerson?.trim() || null;
    }
    if (body.contactEmail !== undefined) {
      data.contactEmail = body.contactEmail?.trim() || null;
    }
    if (body.contactPhone !== undefined) {
      data.contactPhone = body.contactPhone?.trim() || null;
    }
    if (body.notes !== undefined) {
      data.notes = body.notes?.trim() || null;
    }

    const updated = await db.client.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update client:", error);
    return NextResponse.json(
      { error: "Failed to update client" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await getSessionOrUnauthorized();
    if (error) return error;

    const { id } = await params;

    const existing = await db.client.findFirst({
      where: { id, deleted: false },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Client not found or already deleted" },
        { status: 404 }
      );
    }

    await db.client.update({
      where: { id },
      data: {
        deleted: true,
        deletedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, message: "Client archived" });
  } catch (error) {
    console.error("Failed to delete client:", error);
    return NextResponse.json(
      { error: "Failed to delete client" },
      { status: 500 }
    );
  }
}
