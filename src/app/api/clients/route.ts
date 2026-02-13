import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrUnauthorized } from "@/lib/auth-utils";
import { COUNTRIES } from "@/lib/countries";
import { INDUSTRIES } from "@/lib/industries";

export async function GET() {
  try {
    const { error } = await getSessionOrUnauthorized();
    if (error) return error;

    const clients = await db.client.findMany({
      where: { deleted: false },
      include: {
        createdByUser: { select: { id: true, name: true } },
        _count: { select: { contracts: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = clients.map((client) => ({
      ...client,
      createdByName: client.createdByUser?.name ?? null,
      createdByUser: undefined,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to list clients:", error);
    return NextResponse.json(
      { error: "Failed to list clients" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { session, error } = await getSessionOrUnauthorized();
    if (error) return error;

    const body = await req.json();
    const { name, country, industry, contactPerson, contactEmail, contactPhone, notes } = body;

    // Validate required fields
    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (!country) {
      return NextResponse.json(
        { error: "Country is required" },
        { status: 400 }
      );
    }

    // Validate country against COUNTRIES list
    const validCountry = COUNTRIES.find((c) => c.code === country);
    if (!validCountry) {
      return NextResponse.json(
        { error: "Invalid country code" },
        { status: 400 }
      );
    }

    // Validate industry if provided
    if (industry && !INDUSTRIES.includes(industry)) {
      return NextResponse.json(
        { error: "Invalid industry" },
        { status: 400 }
      );
    }

    const client = await db.client.create({
      data: {
        name: name.trim(),
        country,
        industry: industry || null,
        contactPerson: contactPerson?.trim() || null,
        contactEmail: contactEmail?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        notes: notes?.trim() || null,
        createdBy: session!.user.id,
      },
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error("Failed to create client:", error);
    return NextResponse.json(
      { error: "Failed to create client" },
      { status: 500 }
    );
  }
}
