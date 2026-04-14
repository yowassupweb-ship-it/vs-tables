import { addDays, startOfDay, startOfWeek, subDays } from "date-fns";
import { DESK_LAYOUT } from "@/lib/desk-layout";
import { WEEKDAY_LABELS } from "@/lib/week";

type DeskMapOverrides = {
  deskOverrides: Record<string, { x: number; y: number }>;
  deskLabelOverrides: Record<string, string>;
  customDesks?: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  unifiedSize?: { width: number; height: number };
};

type FallbackReservation = {
  id: string;
  deskId: string;
  userName: string;
  note: string | null;
  startAt: Date;
  endAt: Date | null;
};

type FallbackStore = {
  reservations: FallbackReservation[];
};

const globalStore = globalThis as typeof globalThis & {
  fallbackStore?: FallbackStore;
};

function getStore(): FallbackStore {
  if (!globalStore.fallbackStore) {
    globalStore.fallbackStore = { reservations: [] };
  }

  return globalStore.fallbackStore;
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

export function getFallbackDesksMapData(dateKey?: string, overrides?: DeskMapOverrides) {
  const store = getStore();
  const now = new Date();
  const todayKey = parseDateStart(dateKey).toISOString().slice(0, 10);

  const baseDesks = DESK_LAYOUT.map((desk) => ({
    id: desk.id,
    label: desk.label,
    x: desk.x,
    y: desk.y,
    width: overrides?.unifiedSize?.width ?? desk.width,
    height: overrides?.unifiedSize?.height ?? desk.height,
  }));
  const customDesks = overrides?.customDesks ?? [];

  return [...baseDesks, ...customDesks].map((desk) => {
    const active = store.reservations
      .filter(
        (reservation) =>
          reservation.deskId === desk.id &&
          reservation.startAt.toISOString().slice(0, 10) === todayKey &&
          (reservation.endAt === null || reservation.endAt > now),
      )
      .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())[0];

    return {
      id: desk.id,
      label: overrides?.deskLabelOverrides[desk.id] ?? desk.label,
      x: overrides?.deskOverrides[desk.id]?.x ?? desk.x,
      y: overrides?.deskOverrides[desk.id]?.y ?? desk.y,
      width: overrides?.unifiedSize?.width ?? desk.width,
      height: overrides?.unifiedSize?.height ?? desk.height,
      currentOwner: active?.userName ?? null,
      currentNote: active?.note ?? null,
      occupiedSince: active?.startAt.toISOString() ?? null,
    };
  });
}

export function getFallbackDeskHistory(deskId: string) {
  const store = getStore();
  const fromDate = subDays(new Date(), 13);

  const grouped = new Map<string, number>();
  for (let index = 0; index < 14; index += 1) {
    const date = subDays(new Date(), 13 - index);
    grouped.set(date.toISOString().slice(0, 10), 0);
  }

  for (const reservation of store.reservations) {
    if (reservation.deskId !== deskId || reservation.startAt < fromDate) {
      continue;
    }

    const key = reservation.startAt.toISOString().slice(0, 10);
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }

  return Array.from(grouped.entries()).map(([day, reservations]) => ({ day, reservations }));
}

export function getFallbackDeskWeekSlots(deskId: string, anchorDate?: string) {
  const store = getStore();
  const parsedAnchor = anchorDate ? new Date(`${anchorDate}T00:00:00`) : new Date();
  const safeAnchor = Number.isNaN(parsedAnchor.getTime()) ? new Date() : parsedAnchor;
  const weekStart = startOfWeek(safeAnchor, { weekStartsOn: 1 });

  return WEEKDAY_LABELS.map((dayLabel, index) => {
    const date = addDays(weekStart, index);
    const key = date.toISOString().slice(0, 10);

    const reservation = store.reservations
      .filter(
        (row) =>
          row.deskId === deskId &&
          row.startAt.toISOString().slice(0, 10) === key &&
          (row.endAt === null || row.endAt > row.startAt),
      )
      .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())[0];

    return {
      dayIndex: index + 1,
      dayLabel,
      date: key,
      owner: reservation?.userName ?? null,
      note: reservation?.note ?? null,
    };
  });
}

type FallbackClaimInput = {
  deskId: string;
  name: string;
  note: string;
  action: "claim" | "release";
  days: number[];
  anchorDate?: string;
  repeatWeeks?: number;
  knownDeskIds?: string[];
};

export function claimFallbackDesk(input: FallbackClaimInput) {
  const { action, deskId, name, note, days, anchorDate, repeatWeeks = 1 } = input;
  const store = getStore();

  const knownDeskIds = new Set([...(input.knownDeskIds ?? []), ...DESK_LAYOUT.map((item) => item.id)]);
  if (!knownDeskIds.has(deskId)) {
    return { ok: false as const, status: 404, error: "Стол не найден" };
  }

  const parsedAnchor = anchorDate ? new Date(`${anchorDate}T00:00:00`) : new Date();
  const safeAnchor = Number.isNaN(parsedAnchor.getTime()) ? new Date() : parsedAnchor;
  const weekStart = startOfWeek(safeAnchor, { weekStartsOn: 1 });

  for (let weekOffset = 0; weekOffset < repeatWeeks; weekOffset += 1) {
    for (const dayIndex of days) {
      const dayStart = startOfDay(addDays(weekStart, weekOffset * 7 + dayIndex - 1));
      const dayKey = dayStart.toISOString().slice(0, 10);

      const active = store.reservations
        .filter(
          (reservation) =>
            reservation.deskId === deskId && reservation.startAt.toISOString().slice(0, 10) === dayKey,
        )
        .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())[0];

      if (action === "release") {
        if (!active) {
          continue;
        }

        store.reservations = store.reservations.filter((reservation) => reservation.id !== active.id);
        continue;
      }

      if (active && active.userName !== name) {
        return {
          ok: false as const,
          status: 409,
          error: `Слот ${WEEKDAY_LABELS[dayIndex - 1]} уже занят`,
        };
      }

      if (active && active.userName === name) {
        active.note = note || null;
        continue;
      }

      store.reservations.push({
        id: `${deskId}-${dayKey}`,
        deskId,
        userName: name,
        note: note || null,
        startAt: dayStart,
        endAt: addDays(dayStart, 1),
      });
    }
  }

  return { ok: true as const };
}
