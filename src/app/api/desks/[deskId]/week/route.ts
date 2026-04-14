import { NextResponse } from "next/server";
import { addDays, startOfWeek } from "date-fns";
import { z } from "zod";
import { getDeskWeekSlots, saveDeskDayMode } from "@/lib/desk-queries";

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

const updateModeSchema = z.object({
  dayIndex: z.number().int().min(1).max(7),
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  workMode: z.enum(["office", "remote"]),
});

export async function POST(request: Request, { params }: Params) {
  try {
    const { deskId } = await params;
    const body = await request.json().catch(() => null);
    const parsed = updateModeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }

    const { dayIndex, anchorDate, workMode } = parsed.data;
    const parsedAnchor = new Date(`${anchorDate}T00:00:00`);
    const safeAnchor = Number.isNaN(parsedAnchor.getTime()) ? new Date() : parsedAnchor;
    const weekStart = startOfWeek(safeAnchor, { weekStartsOn: 1 });
    const dayDate = addDays(weekStart, dayIndex - 1).toISOString().slice(0, 10);

    await saveDeskDayMode(deskId, dayDate, workMode);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/desks/[deskId]/week failed", error);
    return NextResponse.json({ error: "Не удалось сохранить режим дня" }, { status: 500 });
  }
}
