"use client";

import { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDistanceToNow, format } from "date-fns";
import { ru } from "date-fns/locale";
import { OFFICE_WALL_SEGMENTS, type WallSegment } from "@/lib/desk-layout";

type DeskMapItem = {
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

type CustomDesk = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type DeskWeekSlot = {
  dayIndex: number;
  dayLabel: string;
  date: string;
  owner: string | null;
  note: string | null;
  workMode: WorkMode;
};

type WorkMode = "office" | "remote";

type LayoutSnapshot = {
  deskOverrides: Record<string, { x: number; y: number }>;
  deskRotationOverrides: Record<string, number>;
  customDesks: CustomDesk[];
  wallOverrides: Record<string, WallSegment>;
  removedWallIds: string[];
  deskLabelOverrides: Record<string, string>;
};

const fullNameRegex = /^[A-Za-zА-Яа-яЁё-]+\s+[A-Za-zА-Яа-яЁё-]+(?:\s+[A-Za-zА-Яа-яЁё-]+)*$/;
const LAYOUT_EDIT_PASSWORD = "admin000";

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getDayIndexFromDateKey(dateKey: string) {
  const day = new Date(`${dateKey}T00:00:00`).getDay();
  return day === 0 ? 7 : day;
}

export function OfficeDashboard() {
  const [desks, setDesks] = useState<DeskMapItem[]>([]);
  const [selectedDeskId, setSelectedDeskId] = useState<string>("desk-01");
  const [weekSlots, setWeekSlots] = useState<DeskWeekSlot[]>([]);
  const [dayModeByIndex, setDayModeByIndex] = useState<Record<number, WorkMode>>({});
  const [selectedDayIndexes, setSelectedDayIndexes] = useState<number[]>(() => [getDayIndexFromDateKey(getTodayDateKey())]);
  const [hoveredDeskId, setHoveredDeskId] = useState<string | null>(null);
  const [hoverTooltipPosition, setHoverTooltipPosition] = useState<{ left: number; top: number } | null>(null);
  const [hoverTimelineByDesk, setHoverTimelineByDesk] = useState<Record<string, DeskWeekSlot[]>>({});
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateKey());
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState<number>(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [layoutStatus, setLayoutStatus] = useState<string | null>(null);
  const [deskOverrides, setDeskOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [deskRotationOverrides, setDeskRotationOverrides] = useState<Record<string, number>>({});
  const [customDesks, setCustomDesks] = useState<CustomDesk[]>([]);
  const [wallOverrides, setWallOverrides] = useState<Record<string, WallSegment>>({});
  const [removedWallIds, setRemovedWallIds] = useState<string[]>([]);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [deskLabelOverrides, setDeskLabelOverrides] = useState<Record<string, string>>({});

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const importLayoutInputRef = useRef<HTMLInputElement | null>(null);
  const deskDragRef = useRef<{ deskId: string; offsetX: number; offsetY: number } | null>(null);
  const wallDragRef = useRef<{
    wallId: string;
    startXPercent: number;
    startYPercent: number;
    initialWall: WallSegment;
  } | null>(null);

  const selectedDesk = useMemo(
    () => desks.find((desk) => desk.id === selectedDeskId) ?? null,
    [desks, selectedDeskId],
  );

  const desksWithOverrides = useMemo(() => {
    return desks.map((desk) => {
      const override = deskOverrides[desk.id];
      return {
        ...desk,
        x: override?.x ?? desk.x,
        y: override?.y ?? desk.y,
        label: deskLabelOverrides[desk.id] ?? desk.label,
      };
    });
  }, [deskLabelOverrides, deskOverrides, desks]);

  const wallSegmentsWithOverrides = useMemo(() => {
    const removed = new Set(removedWallIds);
    const baseIds = new Set(OFFICE_WALL_SEGMENTS.map((wall) => wall.id));

    const baseWalls = OFFICE_WALL_SEGMENTS
      .filter((wall) => !removed.has(wall.id))
      .map((wall) => wallOverrides[wall.id] ?? wall);

    const customWalls = Object.values(wallOverrides).filter(
      (wall) => !baseIds.has(wall.id) && !removed.has(wall.id),
    );

    return [...baseWalls, ...customWalls];
  }, [removedWallIds, wallOverrides]);

  const hoveredDesk = useMemo(
    () => desksWithOverrides.find((desk) => desk.id === hoveredDeskId) ?? null,
    [desksWithOverrides, hoveredDeskId],
  );

  const hoveredDeskSlots = useMemo(() => {
    if (!hoveredDeskId) {
      return [] as DeskWeekSlot[];
    }

    return hoverTimelineByDesk[`${hoveredDeskId}:${selectedDate}`] ?? [];
  }, [hoverTimelineByDesk, hoveredDeskId, selectedDate]);

  const parseJsonSafe = useCallback(async <T,>(response: Response): Promise<T | null> => {
    const raw = await response.text();
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }, []);

  const getDeskRotation = useCallback((deskId: string) => {
    const raw = deskRotationOverrides[deskId] ?? 0;
    const normalized = ((raw % 360) + 360) % 360;
    return normalized;
  }, [deskRotationOverrides]);

  const selectedDayIndex = useMemo(() => {
    const day = new Date(`${selectedDate}T00:00:00`).getDay();
    return day === 0 ? 7 : day;
  }, [selectedDate]);

  const displayWeekSlots = useMemo(() => {
    if (weekSlots.length > 0) {
      return weekSlots;
    }

    const parsedAnchor = new Date(`${selectedDate}T00:00:00`);
    const safeAnchor = Number.isNaN(parsedAnchor.getTime()) ? new Date() : parsedAnchor;
    const weekStart = new Date(safeAnchor);
    const day = weekStart.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    weekStart.setDate(weekStart.getDate() + diffToMonday);

    return ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((dayLabel, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);

      return {
        dayIndex: index + 1,
        dayLabel,
        date: date.toISOString().slice(0, 10),
        owner: null,
        note: null,
        workMode: "office" as const,
      };
    });
  }, [selectedDate, weekSlots]);

  const selectedDateLabel = useMemo(() => {
    const date = new Date(`${selectedDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return format(date, "EEEE, d MMMM", { locale: ru });
  }, [selectedDate]);

  const onSelectedDateChange = useCallback((nextDate: string) => {
    setSelectedDate(nextDate);
    setSelectedDayIndexes([getDayIndexFromDateKey(nextDate)]);
  }, []);

  const handleDeskSelect = useCallback((deskId: string) => {
    if (deskId !== selectedDeskId) {
      setSelectedDayIndexes([getDayIndexFromDateKey(selectedDate)]);
      setDayModeByIndex({});
      setName("");
      setNote("");
      setError(null);
    }

    setSelectedDeskId(deskId);
  }, [selectedDate, selectedDeskId]);

  useEffect(() => {
    const raw = localStorage.getItem("office-map-layout-overrides");
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, { x: number; y: number }>;
      setDeskOverrides(parsed);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("office-map-label-overrides");
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      setDeskLabelOverrides(parsed);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("office-map-wall-overrides");
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, WallSegment>;
      setWallOverrides(parsed);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("office-map-removed-walls");
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as string[];
      setRemovedWallIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("office-map-layout-overrides", JSON.stringify(deskOverrides));
  }, [deskOverrides]);

  useEffect(() => {
    localStorage.setItem("office-map-wall-overrides", JSON.stringify(wallOverrides));
  }, [wallOverrides]);

  useEffect(() => {
    localStorage.setItem("office-map-removed-walls", JSON.stringify(removedWallIds));
  }, [removedWallIds]);

  useEffect(() => {
    localStorage.setItem("office-map-label-overrides", JSON.stringify(deskLabelOverrides));
  }, [deskLabelOverrides]);

  useEffect(() => {
    localStorage.setItem("office-map-rotation-overrides", JSON.stringify(deskRotationOverrides));
  }, [deskRotationOverrides]);

  useEffect(() => {
    const raw = localStorage.getItem("office-map-rotation-overrides");
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, number>;
      setDeskRotationOverrides(parsed);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    setHoverTimelineByDesk({});
  }, [selectedDate]);

  const loadLayoutFromServer = useCallback(async () => {
    try {
      const response = await fetch("/api/layout", { cache: "no-store" });
      const data = await parseJsonSafe<{
        deskOverrides?: Record<string, { x: number; y: number }>;
        deskRotationOverrides?: Record<string, number>;
        customDesks?: CustomDesk[];
        wallOverrides?: Record<string, WallSegment>;
        removedWallIds?: string[];
        deskLabelOverrides?: Record<string, string>;
      }>(response);

      if (!response.ok || !data) {
        return;
      }

      setDeskOverrides(data.deskOverrides ?? {});
      setDeskRotationOverrides(data.deskRotationOverrides ?? {});
      setCustomDesks(data.customDesks ?? []);
      setWallOverrides(data.wallOverrides ?? {});
      setRemovedWallIds(data.removedWallIds ?? []);
      setDeskLabelOverrides(data.deskLabelOverrides ?? {});
    } catch {
      // noop
    }
  }, [parseJsonSafe]);

  const loadDesks = useCallback(async () => {
    try {
      const response = await fetch(`/api/desks?date=${selectedDate}`, { cache: "no-store" });
      const data = await parseJsonSafe<{ desks?: DeskMapItem[]; error?: string }>(response);

      if (!response.ok || !data?.desks) {
        setError(data?.error ?? "Не удалось загрузить карту столов");
        setDesks([]);
        return;
      }

      setError(null);
      setDesks(data.desks);

      if (!selectedDeskId && data.desks[0]) {
        setSelectedDeskId(data.desks[0].id);
      }
    } catch {
      setError("Сервер недоступен");
      setDesks([]);
    }
  }, [parseJsonSafe, selectedDate, selectedDeskId]);

  const loadWeekSlots = useCallback(async (deskId: string) => {
    try {
      const response = await fetch(`/api/desks/${deskId}/week?date=${selectedDate}`, { cache: "no-store" });
      const data = await parseJsonSafe<{ slots?: DeskWeekSlot[]; error?: string }>(response);

      if (!response.ok || !data?.slots) {
        setWeekSlots([]);
        if (data?.error) {
          setError(data.error);
        }
        return;
      }

      setWeekSlots(data.slots);
    } catch {
      setWeekSlots([]);
    }
  }, [parseJsonSafe, selectedDate]);

  const loadHoverTimeline = useCallback(async (deskId: string) => {
    const timelineKey = `${deskId}:${selectedDate}`;

    try {
      const response = await fetch(`/api/desks/${deskId}/week?date=${selectedDate}`, { cache: "no-store" });
      const data = await parseJsonSafe<{ slots?: DeskWeekSlot[] }>(response);

      if (!response.ok || !data?.slots) {
        return;
      }

      setHoverTimelineByDesk((current) => ({
        ...current,
        [timelineKey]: data.slots ?? [],
      }));
    } catch {
      // noop
    }
  }, [parseJsonSafe, selectedDate]);

  const startDeskDrag = useCallback((event: ReactMouseEvent<HTMLButtonElement>, desk: DeskMapItem) => {
    if (!layoutEditMode || !canvasRef.current) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const deskX = (desk.x / 100) * rect.width;
    const deskY = (desk.y / 100) * rect.height;

    deskDragRef.current = {
      deskId: desk.id,
      offsetX: event.clientX - rect.left - deskX,
      offsetY: event.clientY - rect.top - deskY,
    };
  }, [layoutEditMode]);

  const startWallDrag = useCallback((event: ReactMouseEvent<HTMLDivElement>, wall: WallSegment) => {
    if (!layoutEditMode || !canvasRef.current) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((event.clientY - rect.top) / rect.height) * 100;

    wallDragRef.current = {
      wallId: wall.id,
      startXPercent: xPercent,
      startYPercent: yPercent,
      initialWall: wall,
    };
    setSelectedWallId(wall.id);
  }, [layoutEditMode]);

  useEffect(() => {
    function onPointerMove(event: MouseEvent) {
      if (!canvasRef.current) {
        return;
      }

      if (deskDragRef.current) {
        const draggingDesk = desksWithOverrides.find((desk) => desk.id === deskDragRef.current?.deskId);
        if (!draggingDesk) {
          return;
        }

        const rect = canvasRef.current.getBoundingClientRect();
        const rawX = ((event.clientX - rect.left - deskDragRef.current.offsetX) / rect.width) * 100;
        const rawY = ((event.clientY - rect.top - deskDragRef.current.offsetY) / rect.height) * 100;

        const maxX = 100 - draggingDesk.width;
        const maxY = 100 - draggingDesk.height;

        const x = Math.max(0, Math.min(maxX, rawX));
        const y = Math.max(0, Math.min(maxY, rawY));

        setDeskOverrides((current) => ({
          ...current,
          [draggingDesk.id]: { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) },
        }));
        return;
      }

      if (!wallDragRef.current) {
        return;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      const currentX = ((event.clientX - rect.left) / rect.width) * 100;
      const currentY = ((event.clientY - rect.top) / rect.height) * 100;

      const deltaX = currentX - wallDragRef.current.startXPercent;
      const deltaY = currentY - wallDragRef.current.startYPercent;

      let moved: WallSegment = {
        ...wallDragRef.current.initialWall,
        x1: wallDragRef.current.initialWall.x1 + deltaX,
        y1: wallDragRef.current.initialWall.y1 + deltaY,
        x2: wallDragRef.current.initialWall.x2 + deltaX,
        y2: wallDragRef.current.initialWall.y2 + deltaY,
      };

      const minX = Math.min(moved.x1, moved.x2);
      const maxX = Math.max(moved.x1, moved.x2);
      const minY = Math.min(moved.y1, moved.y2);
      const maxY = Math.max(moved.y1, moved.y2);

      if (minX < 0) {
        moved = { ...moved, x1: moved.x1 - minX, x2: moved.x2 - minX };
      }
      if (maxX > 100) {
        const fix = maxX - 100;
        moved = { ...moved, x1: moved.x1 - fix, x2: moved.x2 - fix };
      }
      if (minY < 0) {
        moved = { ...moved, y1: moved.y1 - minY, y2: moved.y2 - minY };
      }
      if (maxY > 100) {
        const fix = maxY - 100;
        moved = { ...moved, y1: moved.y1 - fix, y2: moved.y2 - fix };
      }

      setWallOverrides((current) => ({
        ...current,
        [wallDragRef.current!.wallId]: {
          ...moved,
          x1: Number(moved.x1.toFixed(2)),
          y1: Number(moved.y1.toFixed(2)),
          x2: Number(moved.x2.toFixed(2)),
          y2: Number(moved.y2.toFixed(2)),
        },
      }));
    }

    function onPointerUp() {
      deskDragRef.current = null;
      wallDragRef.current = null;
    }

    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);

    return () => {
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
    };
  }, [desksWithOverrides]);

  useEffect(() => {
    void loadLayoutFromServer();
  }, [loadLayoutFromServer]);

  useEffect(() => {
    void loadDesks();
  }, [loadDesks, selectedDate]);

  useEffect(() => {
    if (!selectedDeskId) {
      return;
    }

    void loadWeekSlots(selectedDeskId);
  }, [loadWeekSlots, selectedDeskId]);

  useEffect(() => {
    const eventSource = new EventSource("/api/events");

    eventSource.onmessage = () => {
      setHoverTimelineByDesk({});
      void loadDesks();
      if (selectedDeskId) {
        void loadWeekSlots(selectedDeskId);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    const interval = setInterval(() => {
      setHoverTimelineByDesk({});
      void loadDesks();
      if (selectedDeskId) {
        void loadWeekSlots(selectedDeskId);
      }
    }, 20000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, [loadWeekSlots, loadDesks, selectedDeskId]);

  const isFullNameValid = useMemo(() => fullNameRegex.test(name.trim()), [name]);

  const saveLayoutToServer = useCallback(async () => {
    setLayoutBusy(true);
    setLayoutStatus(null);

    try {
      const response = await fetch("/api/layout", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deskOverrides,
          deskRotationOverrides,
          customDesks,
          wallOverrides,
          removedWallIds,
          deskLabelOverrides,
        }),
      });

      if (!response.ok) {
        setLayoutStatus("Не удалось сохранить на сервер");
        return;
      }

      setLayoutStatus("Расстановка сохранена на сервере");
    } catch {
      setLayoutStatus("Сервер недоступен");
    } finally {
      setLayoutBusy(false);
    }
  }, [customDesks, deskLabelOverrides, deskOverrides, deskRotationOverrides, removedWallIds, wallOverrides]);

  const exportLayoutToFile = useCallback(() => {
    const snapshot: LayoutSnapshot = {
      deskOverrides,
      deskRotationOverrides,
      customDesks,
      wallOverrides,
      removedWallIds,
      deskLabelOverrides,
    };

    const fileName = `office-layout-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
    setLayoutStatus("Файл расстановки сохранен");
  }, [customDesks, deskLabelOverrides, deskOverrides, deskRotationOverrides, removedWallIds, wallOverrides]);

  const applyLayoutSnapshot = useCallback((snapshot: LayoutSnapshot) => {
    setDeskOverrides(snapshot.deskOverrides ?? {});
    setDeskRotationOverrides(snapshot.deskRotationOverrides ?? {});
    setCustomDesks(snapshot.customDesks ?? []);
    setWallOverrides(snapshot.wallOverrides ?? {});
    setRemovedWallIds(snapshot.removedWallIds ?? []);
    setDeskLabelOverrides(snapshot.deskLabelOverrides ?? {});
  }, []);

  const onImportLayoutFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? "{}")) as Partial<LayoutSnapshot>;
        const snapshot: LayoutSnapshot = {
          deskOverrides: parsed.deskOverrides ?? {},
          deskRotationOverrides: parsed.deskRotationOverrides ?? {},
          customDesks: parsed.customDesks ?? [],
          wallOverrides: parsed.wallOverrides ?? {},
          removedWallIds: parsed.removedWallIds ?? [],
          deskLabelOverrides: parsed.deskLabelOverrides ?? {},
        };

        applyLayoutSnapshot(snapshot);
        setLayoutStatus("Расстановка импортирована из файла");
      } catch {
        setLayoutStatus("Некорректный файл расстановки");
      } finally {
        event.target.value = "";
      }
    };

    reader.onerror = () => {
      setLayoutStatus("Не удалось прочитать файл");
      event.target.value = "";
    };

    reader.readAsText(file);
  }, [applyLayoutSnapshot]);

  const restoreLayoutFromServer = useCallback(async () => {
    setLayoutBusy(true);
    setLayoutStatus(null);

    try {
      await loadLayoutFromServer();
      setLayoutStatus("Расстановка загружена с сервера");
    } catch {
      setLayoutStatus("Не удалось загрузить с сервера");
    } finally {
      setLayoutBusy(false);
    }
  }, [loadLayoutFromServer]);

  const toggleDaySelection = useCallback((slot: DeskWeekSlot) => {
    setSelectedDayIndexes((current) => {
      const exists = current.includes(slot.dayIndex);
      if (exists) {
        const next = current.filter((day) => day !== slot.dayIndex);
        return next;
      }

      const next = [...current, slot.dayIndex].sort((a, b) => a - b);
      return next;
    });
  }, []);

  const setDayMode = useCallback(async (dayIndex: number, mode: WorkMode) => {
    setDayModeByIndex((current) => ({
      ...current,
      [dayIndex]: mode,
    }));

    if (!selectedDeskId) {
      return;
    }

    try {
      const response = await fetch(`/api/desks/${selectedDeskId}/week`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dayIndex,
          anchorDate: selectedDate,
          workMode: mode,
        }),
      });

      if (!response.ok) {
        setError("Не удалось сохранить режим дня");
      }
    } catch {
      setError("Сервер недоступен");
    }
  }, [selectedDate, selectedDeskId]);

  useEffect(() => {
    setDayModeByIndex((current) => {
      const next: Record<number, WorkMode> = { ...current };
      for (const slot of weekSlots) {
        if (!next[slot.dayIndex]) {
          next[slot.dayIndex] = slot.workMode ?? "office";
        }
      }
      return next;
    });
  }, [weekSlots]);

  const renameDesk = useCallback((desk: DeskMapItem) => {
    if (!layoutEditMode) {
      return;
    }

    const nextLabel = window.prompt("Новый номер стола", desk.label)?.trim() ?? "";
    if (!nextLabel) {
      return;
    }

    if (!/^\d{1,3}$/.test(nextLabel)) {
      setError("Номер стола должен быть числом (до 3 цифр)");
      return;
    }

    const duplicate = desksWithOverrides.some(
      (item) => item.id !== desk.id && (deskLabelOverrides[item.id] ?? item.label) === nextLabel,
    );

    if (duplicate) {
      setError("Такой номер уже есть");
      return;
    }

    setDeskLabelOverrides((current) => ({
      ...current,
      [desk.id]: nextLabel,
    }));
  }, [deskLabelOverrides, desksWithOverrides, layoutEditMode]);

  const copySelectedWall = useCallback(() => {
    if (!layoutEditMode || !selectedWallId) {
      return;
    }

    const sourceWall = wallSegmentsWithOverrides.find((wall) => wall.id === selectedWallId);
    if (!sourceWall) {
      return;
    }

    const nextId = `wall-copy-${Date.now()}`;
    const offset = 1.5;
    const nextWall: WallSegment = {
      ...sourceWall,
      id: nextId,
      x1: Number(Math.max(0, Math.min(100, sourceWall.x1 + offset)).toFixed(2)),
      y1: Number(Math.max(0, Math.min(100, sourceWall.y1 + offset)).toFixed(2)),
      x2: Number(Math.max(0, Math.min(100, sourceWall.x2 + offset)).toFixed(2)),
      y2: Number(Math.max(0, Math.min(100, sourceWall.y2 + offset)).toFixed(2)),
    };

    setWallOverrides((current) => ({
      ...current,
      [nextWall.id]: nextWall,
    }));
    setRemovedWallIds((current) => current.filter((id) => id !== nextWall.id));
    setSelectedWallId(nextWall.id);
  }, [layoutEditMode, selectedWallId, wallSegmentsWithOverrides]);

  const deleteSelectedWall = useCallback(() => {
    if (!layoutEditMode || !selectedWallId) {
      return;
    }

    const isBaseWall = OFFICE_WALL_SEGMENTS.some((wall) => wall.id === selectedWallId);

    if (isBaseWall) {
      setRemovedWallIds((current) => (current.includes(selectedWallId) ? current : [...current, selectedWallId]));
    }

    setWallOverrides((current) => {
      if (!current[selectedWallId]) {
        return current;
      }

      const next = { ...current };
      delete next[selectedWallId];
      return next;
    });

    setSelectedWallId(null);
  }, [layoutEditMode, selectedWallId]);

  const copySelectedDesk = useCallback(async () => {
    if (!layoutEditMode || !selectedDesk) {
      return;
    }

    const proposed = String(
      Math.max(
        1,
        ...desksWithOverrides
          .map((desk) => Number.parseInt((deskLabelOverrides[desk.id] ?? desk.label).replace(/\D/g, ""), 10))
          .filter((value) => Number.isFinite(value)),
      ) + 1,
    );

    const nextLabel = window.prompt("Номер для копии стола", proposed)?.trim() ?? "";
    if (!nextLabel) {
      return;
    }

    if (!/^\d{1,3}$/.test(nextLabel)) {
      setError("Номер стола должен быть числом (до 3 цифр)");
      return;
    }

    setLayoutBusy(true);
    setLayoutStatus(null);

    try {
      const response = await fetch("/api/desks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceDeskId: selectedDesk.id,
          label: nextLabel,
        }),
      });

      const payload = await parseJsonSafe<{ error?: string; desk?: { id: string } }>(response);
      if (!response.ok) {
        setLayoutStatus(payload?.error ?? "Не удалось скопировать стол");
        return;
      }

      setLayoutStatus("Копия стола создана");
      await loadDesks();
      await loadLayoutFromServer();
      if (payload?.desk?.id) {
        setSelectedDeskId(payload.desk.id);
      }
    } catch {
      setLayoutStatus("Сервер недоступен");
    } finally {
      setLayoutBusy(false);
    }
  }, [deskLabelOverrides, desksWithOverrides, layoutEditMode, loadDesks, loadLayoutFromServer, parseJsonSafe, selectedDesk]);

  const rotateSelectedDesk = useCallback((step: number) => {
    if (!layoutEditMode || !selectedDesk) {
      return;
    }

    setDeskRotationOverrides((current) => {
      const next = ((current[selectedDesk.id] ?? 0) + step + 360) % 360;
      return {
        ...current,
        [selectedDesk.id]: next,
      };
    });
  }, [layoutEditMode, selectedDesk]);

  const onToggleLayoutMode = useCallback((checked: boolean) => {
    if (!checked) {
      setLayoutEditMode(false);
      return;
    }

    const entered = window.prompt("Введите пароль для режима расстановки") ?? "";
    if (entered !== LAYOUT_EDIT_PASSWORD) {
      setLayoutStatus("Неверный пароль для режима расстановки");
      setLayoutEditMode(false);
      return;
    }

    setLayoutStatus(null);
    setLayoutEditMode(true);
  }, []);

  async function handleAction(action: "claim" | "release") {
    if (!selectedDesk) {
      return;
    }

    setError(null);

    if (selectedDayIndexes.length === 0) {
      setError("Выберите хотя бы один день недели");
      return;
    }

    const enteredName = name.trim();
    const selectedSlots = weekSlots.filter((slot) => selectedDayIndexes.includes(slot.dayIndex));

    let requestName = enteredName;

    if (action === "claim") {
      if (!isFullNameValid) {
        setError("Введите имя и фамилию");
        return;
      }
    }

    if (action === "release") {
      const hasAnyBusySlot = selectedSlots.some((slot) => Boolean(slot.owner));
      if (!hasAnyBusySlot) {
        setError("Для выбранных дней стол уже свободен");
        return;
      }
    }

    setBusy(true);

    try {
      const response = await fetch("/api/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deskId: selectedDesk.id,
          name: requestName,
          note,
          action,
          days: selectedDayIndexes,
          workModeByDay: selectedDayIndexes.reduce<Record<string, WorkMode>>((acc, dayIndex) => {
            const slot = weekSlots.find((item) => item.dayIndex === dayIndex);
            acc[String(dayIndex)] = dayModeByIndex[dayIndex] ?? slot?.workMode ?? "office";
            return acc;
          }, {}),
          anchorDate: selectedDate,
          repeatWeeks: repeatWeekly ? repeatWeeks : 1,
        }),
      });

      const payload = await parseJsonSafe<{ error?: string }>(response);

      if (!response.ok) {
        setError(payload?.error ?? "Ошибка при обновлении стола");
        return;
      }

      await loadDesks();
      await loadWeekSlots(selectedDesk.id);
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void handleAction("claim");
  }

  return (
    <div className="dashboard-grid">
      <section className="panel map-panel">
        <div className="panel-title-row">
          <h2>Карта столов</h2>
          <div className="date-pick-row">
            <label>
              Дата
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => onSelectedDateChange(event.target.value)}
              />
            </label>
            <p>{selectedDateLabel}</p>
          </div>
          <div className="layout-tools-row">
            <label className="layout-switch">
              <input
                type="checkbox"
                checked={layoutEditMode}
                onChange={(event) => onToggleLayoutMode(event.target.checked)}
              />
              Режим расстановки (столы и линии)
            </label>
            {layoutEditMode ? (
              <>
                <button
                  type="button"
                  className="layout-reset-btn"
                  disabled={layoutBusy}
                  onClick={() => {
                    setDeskOverrides({});
                    setDeskRotationOverrides({});
                    setCustomDesks([]);
                    setWallOverrides({});
                    setRemovedWallIds([]);
                    setSelectedWallId(null);
                    setDeskLabelOverrides({});
                  }}
                >
                  Сбросить локально
                </button>
                <button type="button" className="layout-reset-btn" disabled={layoutBusy} onClick={() => void saveLayoutToServer()}>
                  Сохранить на сервер
                </button>
                <button type="button" className="layout-reset-btn" disabled={layoutBusy} onClick={() => void restoreLayoutFromServer()}>
                  Загрузить с сервера
                </button>
                <button type="button" className="layout-reset-btn" disabled={layoutBusy} onClick={exportLayoutToFile}>
                  Экспорт JSON
                </button>
                <button
                  type="button"
                  className="layout-reset-btn"
                  disabled={layoutBusy}
                  onClick={() => importLayoutInputRef.current?.click()}
                >
                  Импорт JSON
                </button>
                <button type="button" className="layout-reset-btn" disabled={layoutBusy || !selectedDesk} onClick={() => void copySelectedDesk()}>
                  Копировать выбранный стол
                </button>
                <button type="button" className="layout-reset-btn" disabled={layoutBusy || !selectedDesk} onClick={() => rotateSelectedDesk(-90)}>
                  Повернуть стол -90°
                </button>
                <button type="button" className="layout-reset-btn" disabled={layoutBusy || !selectedDesk} onClick={() => rotateSelectedDesk(90)}>
                  Повернуть стол +90°
                </button>
                <button type="button" className="layout-reset-btn" disabled={layoutBusy || !selectedWallId} onClick={copySelectedWall}>
                  Копировать линию
                </button>
                <button type="button" className="layout-reset-btn" disabled={layoutBusy || !selectedWallId} onClick={deleteSelectedWall}>
                  Удалить линию
                </button>
              </>
            ) : null}
          </div>
          <input
            ref={importLayoutInputRef}
            type="file"
            accept="application/json"
            onChange={onImportLayoutFile}
            style={{ display: "none" }}
          />
          {layoutStatus ? <p>{layoutStatus}</p> : null}
          <p className="mobile-scroll-hint">Свайпайте схему влево/вправо</p>
        </div>

        <div className="office-canvas-scroll">
          <div className="office-canvas" role="list" aria-label="Карта офисных столов" ref={canvasRef}>
          {wallSegmentsWithOverrides.map((wall) => {
            const minX = Math.min(wall.x1, wall.x2);
            const minY = Math.min(wall.y1, wall.y2);
            const width = Math.abs(wall.x2 - wall.x1);
            const height = Math.abs(wall.y2 - wall.y1);
            const isVertical = width < height;

            return (
              <div
                key={wall.id}
                className={`wall-segment ${layoutEditMode ? "draggable" : ""} ${selectedWallId === wall.id ? "selected" : ""}`}
                style={{
                  left: `${isVertical ? minX - 0.2 : minX}%`,
                  top: `${isVertical ? minY : minY - 0.2}%`,
                  width: `${isVertical ? 0.4 : Math.max(0.4, width)}%`,
                  height: `${isVertical ? Math.max(0.4, height) : 0.4}%`,
                }}
                onMouseDown={(event) => startWallDrag(event, wall)}
                aria-hidden
              />
            );
          })}

          {desksWithOverrides.map((desk) => {
            const isSelected = desk.id === selectedDeskId;
            const isBusy = Boolean(desk.currentOwner);

            return (
              <button
                key={desk.id}
                type="button"
                className={`desk-tile ${isSelected ? "selected" : ""} ${isBusy ? "busy" : ""}`}
                style={{
                  left: `${desk.x}%`,
                  top: `${desk.y}%`,
                  width: `${desk.width}%`,
                  height: `${desk.height}%`,
                  ["--desk-rotation" as string]: `${getDeskRotation(desk.id)}deg`,
                  transform: `rotate(${getDeskRotation(desk.id)}deg)`,
                }}
                onClick={() => handleDeskSelect(desk.id)}
                onMouseDown={(event) => startDeskDrag(event, desk)}
                onDoubleClick={() => renameDesk(desk)}
                onMouseEnter={(event) => {
                  if (layoutEditMode) {
                    return;
                  }

                  const rect = event.currentTarget.getBoundingClientRect();
                  const tooltipWidth = 220;
                  const gap = 6;
                  const placeLeft = rect.right + tooltipWidth + gap > window.innerWidth;
                  const left = placeLeft
                    ? Math.max(8, rect.left - tooltipWidth - gap)
                    : Math.min(window.innerWidth - tooltipWidth - 8, rect.right + gap);
                  const top = Math.max(8, Math.min(window.innerHeight - 240, rect.top + rect.height / 2 - 100));

                  setHoverTooltipPosition({ left, top });
                  setHoveredDeskId(desk.id);
                  void loadHoverTimeline(desk.id);
                }}
                onMouseLeave={() => {
                  setHoveredDeskId((current) => (current === desk.id ? null : current));
                  setHoverTooltipPosition(null);
                }}
              >
                <span style={{ transform: "rotate(calc(-1 * var(--desk-rotation)))" }}>{desk.label}</span>
              </button>
            );
          })}
          </div>
        </div>

        {!layoutEditMode && hoveredDesk && hoverTooltipPosition && typeof document !== "undefined"
          ? createPortal(
            <div
              className="desk-hover-timeline"
              style={{
                left: `${hoverTooltipPosition.left}px`,
                top: `${hoverTooltipPosition.top}px`,
              }}
            >
              <p className="hover-title">Стол {hoveredDesk.label}</p>
              {hoveredDeskSlots.length > 0 ? (
                <div className="hover-days">
                  {hoveredDeskSlots.map((slot) => (
                    <div key={slot.dayIndex} className={`hover-day-row ${slot.owner ? "busy" : "free"}`}>
                      <span>{slot.dayLabel}</span>
                      <span>{slot.owner ?? "свободно"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="hover-loading">Загрузка...</p>
              )}
            </div>,
            document.body,
          )
          : null}
      </section>

      <section className="panel details-panel">
        <div className="panel-title-row">
          <h3>Столы по дням недели</h3>
          <p>Стол: {selectedDesk?.label ?? "-"}</p>
        </div>

        {selectedDesk ? (
          <>
            <div className="week-slots">
              {displayWeekSlots.map((slot) => {
                const isSelected = selectedDayIndexes.includes(slot.dayIndex);

                return (
                  <label key={slot.dayIndex} className={`week-slot ${slot.owner ? "busy" : "free"}`}>
                    <input
                      type="checkbox"
                      name="week-day"
                      checked={isSelected}
                      onChange={() => toggleDaySelection(slot)}
                    />
                    <span className="week-day">{slot.dayLabel}</span>
                    <span className="week-date">{format(new Date(`${slot.date}T00:00:00`), "dd.MM")}</span>
                    <span className="week-owner">{slot.owner ?? "Свободно"}</span>
                    <select
                      className="week-mode-select"
                      value={dayModeByIndex[slot.dayIndex] ?? "office"}
                      onChange={(event) => {
                        void setDayMode(slot.dayIndex, event.target.value as WorkMode);
                      }}
                    >
                      <option value="office">Офис</option>
                      <option value="remote">Удаленка</option>
                    </select>
                  </label>
                );
              })}
            </div>

            <div className="desk-status-card">
              <p className="status-label">Текущий статус</p>
              <p className="status-value">{selectedDesk.currentOwner ? "Занят" : "Свободен"}</p>
              {selectedDesk.currentOwner ? (
                <p className="status-owner">{selectedDesk.currentOwner}</p>
              ) : null}
              {selectedDesk.currentNote ? <p className="status-note">{selectedDesk.currentNote}</p> : null}
            </div>

            <form className="desk-form" onSubmit={onSubmit}>
              <label>
                Имя и фамилия
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Например, Иван Петров"
                  required
                />
              </label>
              <label>
                Комментарий
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Например, до 18:00"
                  maxLength={140}
                />
              </label>

              <label>
                <span>
                  <input
                    type="checkbox"
                    checked={repeatWeekly}
                    onChange={(event) => setRepeatWeekly(event.target.checked)}
                  />
                  Регулярно по выбранным дням
                </span>
              </label>

              {repeatWeekly ? (
                <label>
                  На сколько недель вперед
                  <input
                    type="number"
                    min={1}
                    max={26}
                    value={repeatWeeks}
                    onChange={(event) => setRepeatWeeks(Math.max(1, Math.min(26, Number(event.target.value) || 1)))}
                  />
                </label>
              ) : null}

              <div className="actions-row">
                <button
                  type="submit"
                  disabled={busy || !isFullNameValid}
                >
                  Занять
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAction("release")}
                >
                  Освободить
                </button>
              </div>

              {!isFullNameValid && name.trim().length > 0 ? (
                <p className="hint-text">Нужно ввести минимум имя и фамилию</p>
              ) : null}

              {error ? <p className="error-text">{error}</p> : null}
            </form>
          </>
        ) : (
          <p>Нет данных по столу.</p>
        )}
      </section>
    </div>
  );
}
