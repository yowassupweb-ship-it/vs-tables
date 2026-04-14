import { NextResponse } from "next/server";
import { z } from "zod";
import { getDesksMapData } from "@/lib/desk-queries";
import { prisma } from "@/lib/prisma";
import { publishDeskEvent } from "@/lib/realtime";
import { isDatabaseUnavailableError } from "@/lib/db-errors";
import { getLayoutPayload, saveLayoutPayload } from "@/lib/layout-store";
import type { LayoutPayload } from "@/lib/layout-store";

export const runtime = "nodejs";

const UNIFIED_DESK_WIDTH = 6;
const UNIFIED_DESK_HEIGHT = 10;

const createDeskSchema = z.object({
  sourceDeskId: z.string().min(1),
  label: z.string().trim().regex(/^\d{1,3}$/),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? undefined;
    const desks = await getDesksMapData(date);
    return NextResponse.json({ desks });
  } catch (error) {
    console.error("GET /api/desks failed", error);
    return NextResponse.json({ error: "Не удалось загрузить столы" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createDeskSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные стола" }, { status: 400 });
  }

  const { sourceDeskId, label } = parsed.data;

  let layout: Omit<LayoutPayload, "updatedAt"> = {
    deskOverrides: {},
    deskRotationOverrides: {},
    customDesks: [],
    wallOverrides: {},
    removedWallIds: [],
    deskLabelOverrides: {},
  };

  try {
    const loadedLayout = await getLayoutPayload();
    layout = {
      deskOverrides: loadedLayout.deskOverrides,
      deskRotationOverrides: loadedLayout.deskRotationOverrides,
      customDesks: loadedLayout.customDesks,
      wallOverrides: loadedLayout.wallOverrides,
      removedWallIds: loadedLayout.removedWallIds,
      deskLabelOverrides: loadedLayout.deskLabelOverrides,
    };
  } catch {
    // Если Redis недоступен, продолжаем с пустым layout и fallback-логикой.
  }

  const allDesks = await getDesksMapData().catch(() => []);
  const sourceByMap = allDesks.find((desk) => desk.id === sourceDeskId);
  if (!sourceByMap) {
    return NextResponse.json({ error: "Исходный стол не найден" }, { status: 404 });
  }

  const duplicateByMap = allDesks.some((desk) => desk.label === label);
  if (duplicateByMap) {
    return NextResponse.json({ error: "Стол с таким номером уже есть" }, { status: 409 });
  }

  try {
    const duplicateByLabel = await prisma.desk.findUnique({ where: { label } });
    if (duplicateByLabel) {
      return NextResponse.json({ error: "Стол с таким номером уже есть" }, { status: 409 });
    }

    const sourceDesk = await prisma.desk.findUnique({ where: { id: sourceDeskId } });
    if (!sourceDesk) {
      return NextResponse.json({ error: "Исходный стол не найден" }, { status: 404 });
    }

    const nextId = `desk-copy-${Date.now()}`;
    const nextX = Math.min(95, sourceDesk.x + 2);
    const nextY = Math.min(95, sourceDesk.y + 2);

    const desk = await prisma.desk.create({
      data: {
        id: nextId,
        label,
        x: nextX,
        y: nextY,
        width: UNIFIED_DESK_WIDTH,
        height: UNIFIED_DESK_HEIGHT,
      },
    });

    await publishDeskEvent({
      type: "desk-updated",
      deskId: desk.id,
      actorName: "layout",
      active: true,
      at: new Date().toISOString(),
    });

    return NextResponse.json({ desk });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      const nextId = `desk-copy-${Date.now()}`;
      const saved = await saveLayoutPayload({
        ...layout,
        customDesks: [
          ...layout.customDesks,
          {
            id: nextId,
            label,
            x: Number(Math.min(95, sourceByMap.x + 2).toFixed(2)),
            y: Number(Math.min(95, sourceByMap.y + 2).toFixed(2)),
            width: UNIFIED_DESK_WIDTH,
            height: UNIFIED_DESK_HEIGHT,
          },
        ],
      });

      await publishDeskEvent({
        type: "desk-updated",
        deskId: nextId,
        actorName: "layout",
        active: true,
        at: new Date().toISOString(),
      });

      return NextResponse.json({ desk: saved.customDesks.find((item) => item.id === nextId), fallback: true });
    }

    console.error("POST /api/desks failed", error);
    return NextResponse.json({ error: "Не удалось создать копию стола" }, { status: 500 });
  }
}
