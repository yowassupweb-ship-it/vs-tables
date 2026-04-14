import { addDays, startOfDay, startOfWeek, subDays } from "date-fns";
import { DESK_LAYOUT } from "@/lib/desk-layout";
import { isDatabaseUnavailableError } from "@/lib/db-errors";
import { getLayoutPayload } from "@/lib/layout-store";
import {
  getFallbackDeskHistory,
  getFallbackDeskWeekSlots,
  getFallbackDesksMapData,
} from "@/lib/fallback-store";
import { prisma } from "@/lib/prisma";
import { WEEKDAY_LABELS } from "@/lib/week";

export type DeskMapItem = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  currentOwner: string | null;
  currentNote: string | null;
  occupiedSince: string | null;
};

export type DeskChartPoint = {
  day: string;
  reservations: number;
};

export type DeskWeekSlot = {
  dayIndex: number;
  dayLabel: string;
  date: string;
  owner: string | null;
  note: string | null;
};

const UNIFIED_DESK_WIDTH = 6;
const UNIFIED_DESK_HEIGHT = 10;

async function ensureDesksSeeded() {
  for (const desk of DESK_LAYOUT) {
    await prisma.desk.upsert({
      where: { id: desk.id },
      update: {
        label: desk.label,
        x: desk.x,
        y: desk.y,
        width: desk.width,
        height: desk.height,
      },
      create: {
        id: desk.id,
        label: desk.label,
        x: desk.x,
        y: desk.y,
        width: desk.width,
        height: desk.height,
      },
    });
  }
}

function parseDateStart(dateKey?: string) {
  if (!dateKey) {
    return startOfDay(new Date());
  }

  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return startOfDay(new Date());
  }

  return startOfDay(parsed);
}

export async function getDesksMapData(dateKey?: string): Promise<DeskMapItem[]> {
  try {
    await ensureDesksSeeded();
    const layout = await getLayoutPayload();

    const dayStart = parseDateStart(dateKey);
    const dayEnd = addDays(dayStart, 1);

    const desks = await prisma.desk.findMany({
      orderBy: { id: "asc" },
      include: {
        reservations: {
          where: {
            startAt: {
              gte: dayStart,
              lt: dayEnd,
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const dbDesks = desks.map((desk: {
      id: string;
      label: string;
      x: number;
      y: number;
      width: number;
      height: number;
      reservations: Array<{ userName: string; note: string | null; startAt: Date }>;
    }) => {
      const active = desk.reservations[0];
      const deskOverride = layout.deskOverrides[desk.id];
      const labelOverride = layout.deskLabelOverrides[desk.id];

      return {
        id: desk.id,
        label: labelOverride ?? desk.label,
        x: deskOverride?.x ?? desk.x,
        y: deskOverride?.y ?? desk.y,
        width: UNIFIED_DESK_WIDTH,
        height: UNIFIED_DESK_HEIGHT,
        currentOwner: active?.userName ?? null,
        currentNote: active?.note ?? null,
        occupiedSince: active?.startAt.toISOString() ?? null,
      };
    });

    const customDeskIds = new Set(dbDesks.map((desk: { id: string }) => desk.id));
    const customDesks = layout.customDesks
      .filter((desk) => !customDeskIds.has(desk.id))
      .map((desk) => {
        const deskOverride = layout.deskOverrides[desk.id];
        const labelOverride = layout.deskLabelOverrides[desk.id];

        return {
          id: desk.id,
          label: labelOverride ?? desk.label,
          x: deskOverride?.x ?? desk.x,
          y: deskOverride?.y ?? desk.y,
          width: UNIFIED_DESK_WIDTH,
          height: UNIFIED_DESK_HEIGHT,
          currentOwner: null,
          currentNote: null,
          occupiedSince: null,
        };
      });

    return [...dbDesks, ...customDesks].sort((a, b) => a.id.localeCompare(b.id));
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      const layout = await getLayoutPayload();
      return getFallbackDesksMapData(dateKey, {
        deskOverrides: layout.deskOverrides,
        deskLabelOverrides: layout.deskLabelOverrides,
        customDesks: layout.customDesks,
        unifiedSize: { width: UNIFIED_DESK_WIDTH, height: UNIFIED_DESK_HEIGHT },
      });
    }

    throw error;
  }
}

export async function getDeskHistory(deskId: string): Promise<DeskChartPoint[]> {
  try {
    const fromDate = subDays(new Date(), 13);

    const reservations = await prisma.deskReservation.findMany({
      where: {
        deskId,
        startAt: {
          gte: fromDate,
        },
      },
      orderBy: { startAt: "asc" },
      select: { startAt: true },
    });

    const grouped = new Map<string, number>();
    for (let i = 0; i < 14; i += 1) {
      const date = subDays(new Date(), 13 - i);
      const key = date.toISOString().slice(0, 10);
      grouped.set(key, 0);
    }

    for (const row of reservations) {
      const key = row.startAt.toISOString().slice(0, 10);
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }

    return Array.from(grouped.entries()).map(([day, reservationsCount]) => ({
      day,
      reservations: reservationsCount,
    }));
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return getFallbackDeskHistory(deskId);
    }

    throw error;
  }
}

export async function getDeskWeekSlots(deskId: string, anchorDate?: string): Promise<DeskWeekSlot[]> {
  try {
    const parsedAnchor = anchorDate ? new Date(`${anchorDate}T00:00:00`) : new Date();
    const safeAnchor = Number.isNaN(parsedAnchor.getTime()) ? new Date() : parsedAnchor;
    const weekStart = startOfWeek(safeAnchor, { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 7);

    const reservations = await prisma.deskReservation.findMany({
      where: {
        deskId,
        startAt: {
          gte: weekStart,
          lt: weekEnd,
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        startAt: true,
        userName: true,
        note: true,
      },
    });

    const byDay = new Map<string, { owner: string; note: string | null }>();
    for (const reservation of reservations) {
      const key = reservation.startAt.toISOString().slice(0, 10);
      if (!byDay.has(key)) {
        byDay.set(key, { owner: reservation.userName, note: reservation.note ?? null });
      }
    }

    return WEEKDAY_LABELS.map((dayLabel, index) => {
      const dayDate = addDays(weekStart, index);
      const key = dayDate.toISOString().slice(0, 10);
      const slot = byDay.get(key);

      return {
        dayIndex: index + 1,
        dayLabel,
        date: key,
        owner: slot?.owner ?? null,
        note: slot?.note ?? null,
      };
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return getFallbackDeskWeekSlots(deskId, anchorDate);
    }

    throw error;
  }
}
