import { NextResponse } from "next/server";
import { getDeskWeekSlots } from "@/lib/desk-queries";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ deskId: string }>;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const { deskId } = await params;
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? undefined;
    const slots = await getDeskWeekSlots(deskId, date);
    return NextResponse.json({ slots });
  } catch (error) {
    console.error("GET /api/desks/[deskId]/week failed", error);
    return NextResponse.json({ error: "Не удалось загрузить недельные слоты" }, { status: 500 });
  }
}
