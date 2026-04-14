import { getRedisPair } from "@/lib/redis";
import type { WallSegment } from "@/lib/desk-layout";

const LAYOUT_KEY = "office_map:layout:v1";

type DeskPoint = { x: number; y: number };

export type CustomDesk = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LayoutPayload = {
  deskOverrides: Record<string, DeskPoint>;
  deskRotationOverrides: Record<string, number>;
  customDesks: CustomDesk[];
  wallOverrides: Record<string, WallSegment>;
  removedWallIds: string[];
  deskLabelOverrides: Record<string, string>;
  updatedAt: string;
};

const globalForLayout = globalThis as typeof globalThis & {
  fallbackLayout?: LayoutPayload;
};

function emptyLayout(): LayoutPayload {
  return {
    deskOverrides: {},
    deskRotationOverrides: {},
    customDesks: [],
    wallOverrides: {},
    removedWallIds: [],
    deskLabelOverrides: {},
    updatedAt: new Date().toISOString(),
  };
}

function normalizeLayout(input: unknown): LayoutPayload {
  if (!input || typeof input !== "object") {
    return emptyLayout();
  }

  const raw = input as Partial<LayoutPayload>;

  return {
    deskOverrides: raw.deskOverrides && typeof raw.deskOverrides === "object" ? raw.deskOverrides : {},
    deskRotationOverrides:
      raw.deskRotationOverrides && typeof raw.deskRotationOverrides === "object" ? raw.deskRotationOverrides : {},
    customDesks: Array.isArray(raw.customDesks)
      ? raw.customDesks.filter((item) => item && typeof item === "object").map((item) => ({
          id: String((item as Partial<CustomDesk>).id ?? ""),
          label: String((item as Partial<CustomDesk>).label ?? ""),
          x: Number((item as Partial<CustomDesk>).x ?? 0),
          y: Number((item as Partial<CustomDesk>).y ?? 0),
          width: Number((item as Partial<CustomDesk>).width ?? 0),
          height: Number((item as Partial<CustomDesk>).height ?? 0),
        })).filter((item) => item.id && item.label)
      : [],
    wallOverrides: raw.wallOverrides && typeof raw.wallOverrides === "object" ? raw.wallOverrides : {},
    removedWallIds: Array.isArray(raw.removedWallIds) ? raw.removedWallIds.filter((item) => typeof item === "string") : [],
    deskLabelOverrides:
      raw.deskLabelOverrides && typeof raw.deskLabelOverrides === "object" ? raw.deskLabelOverrides : {},
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export async function getLayoutPayload(): Promise<LayoutPayload> {
  const { publisher } = await getRedisPair();

  if (!publisher) {
    return globalForLayout.fallbackLayout ?? emptyLayout();
  }

  const raw = await publisher.get(LAYOUT_KEY);
  if (!raw) {
    return emptyLayout();
  }

  try {
    return normalizeLayout(JSON.parse(raw));
  } catch {
    return emptyLayout();
  }
}

export async function saveLayoutPayload(payload: Omit<LayoutPayload, "updatedAt">): Promise<LayoutPayload> {
  const nextPayload: LayoutPayload = {
    deskOverrides: payload.deskOverrides,
    deskRotationOverrides: payload.deskRotationOverrides,
    customDesks: payload.customDesks,
    wallOverrides: payload.wallOverrides,
    removedWallIds: payload.removedWallIds,
    deskLabelOverrides: payload.deskLabelOverrides,
    updatedAt: new Date().toISOString(),
  };

  const { publisher } = await getRedisPair();

  if (!publisher) {
    globalForLayout.fallbackLayout = nextPayload;
    return nextPayload;
  }

  await publisher.set(LAYOUT_KEY, JSON.stringify(nextPayload));
  return nextPayload;
}
