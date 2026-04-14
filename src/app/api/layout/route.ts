import { NextResponse } from "next/server";
import { z } from "zod";
import { publishDeskEvent } from "@/lib/realtime";
import { getLayoutPayload, saveLayoutPayload } from "@/lib/layout-store";

export const runtime = "nodejs";

const wallSegmentSchema = z.object({
  id: z.string().min(1),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
});

const payloadSchema = z.object({
  deskOverrides: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
  deskRotationOverrides: z.record(z.string(), z.number()),
  customDesks: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().trim().min(1).max(12),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
  ),
  wallOverrides: z.record(z.string(), wallSegmentSchema),
  removedWallIds: z.array(z.string().min(1)),
  deskLabelOverrides: z.record(z.string(), z.string().trim().min(1).max(12)),
});

export async function GET() {
  try {
    const layout = await getLayoutPayload();
    return NextResponse.json(layout);
  } catch (error) {
    console.error("GET /api/layout failed", error);
    return NextResponse.json({ error: "Не удалось загрузить расстановку" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные расстановки" }, { status: 400 });
  }

  try {
    const saved = await saveLayoutPayload(parsed.data);

    await publishDeskEvent({
      type: "desk-updated",
      deskId: "layout",
      actorName: "layout",
      active: true,
      at: new Date().toISOString(),
    });

    return NextResponse.json(saved);
  } catch (error) {
    console.error("PUT /api/layout failed", error);
    return NextResponse.json({ error: "Не удалось сохранить расстановку" }, { status: 500 });
  }
}
