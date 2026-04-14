import { NextResponse } from "next/server";
import { addDays, startOfDay, startOfWeek } from "date-fns";
import { z } from "zod";
import { WEEKDAY_LABELS } from "@/lib/week";
import { isDatabaseUnavailableError } from "@/lib/db-errors";
import { claimFallbackDesk } from "@/lib/fallback-store";
import { getLayoutPayload } from "@/lib/layout-store";
import { prisma } from "@/lib/prisma";
import { publishDeskEvent } from "@/lib/realtime";

export const runtime = "nodejs";

const fullNameRegex = /^[A-Za-zА-Яа-яЁё-]+\s+[A-Za-zА-Яа-яЁё-]+(?:\s+[A-Za-zА-Яа-яЁё-]+)*$/;

const claimSchema = z.object({
  deskId: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(5)
    .max(80)
    .refine((value) => fullNameRegex.test(value), "Укажите имя и фамилию"),
  note: z.string().trim().max(140).optional().default(""),
  action: z.enum(["claim", "release"]),
  days: z.array(z.number().int().min(1).max(7)).min(1),
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  repeatWeeks: z.number().int().min(1).max(26).optional().default(1),
});

function getDayRange(dayIndex: number, anchorDate?: string, weekOffset = 0) {
  const parsedAnchor = anchorDate ? new Date(`${anchorDate}T00:00:00`) : new Date();
  const safeAnchor = Number.isNaN(parsedAnchor.getTime()) ? new Date() : parsedAnchor;
  const weekStart = startOfWeek(safeAnchor, { weekStartsOn: 1 });
  const start = startOfDay(addDays(weekStart, weekOffset * 7 + dayIndex - 1));
  const end = addDays(start, 1);
  return { start, end };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = claimSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные" },
      { status: 400 },
    );
  }

  const { deskId, name, note, action, days, anchorDate, repeatWeeks } = parsed.data;
  const uniqueDays = [...new Set(days)].sort((a, b) => a - b);
  const layout = await getLayoutPayload();
  const knownDeskIds = layout.customDesks.map((item) => item.id);

  try {
    const desk = await prisma.desk.findUnique({ where: { id: deskId } });
    if (!desk) {
      const fallbackResult = claimFallbackDesk({
        deskId,
        name,
        note,
        action,
        days: uniqueDays,
        anchorDate,
        repeatWeeks,
        knownDeskIds,
      });

      if (!fallbackResult.ok) {
        return NextResponse.json({ error: fallbackResult.error }, { status: fallbackResult.status });
      }

      await publishDeskEvent({
        type: "desk-updated",
        deskId,
        actorName: name,
        active: action === "claim",
        at: new Date().toISOString(),
      });

      return NextResponse.json({ ok: true, fallback: true });
    }

    await prisma.$transaction(async (tx: any) => {
      for (let weekOffset = 0; weekOffset < repeatWeeks; weekOffset += 1) {
        for (const dayIndex of uniqueDays) {
          const { start, end } = getDayRange(dayIndex, anchorDate, weekOffset);

          const existing = await tx.deskReservation.findFirst({
            where: {
              deskId,
              startAt: {
                gte: start,
                lt: end,
              },
            },
            orderBy: { createdAt: "desc" },
          });

          if (action === "release") {
            if (!existing) {
              continue;
            }

            if (existing.userName !== name) {
              throw new Error(`FORBIDDEN_DAY:${dayIndex}`);
            }

            await tx.deskReservation.delete({ where: { id: existing.id } });
            continue;
          }

          if (existing && existing.userName !== name) {
            throw new Error(`OCCUPIED_DAY:${dayIndex}`);
          }

          if (existing && existing.userName === name) {
            await tx.deskReservation.update({
              where: { id: existing.id },
              data: { note: note || null },
            });
            continue;
          }

          await tx.deskReservation.create({
            data: {
              deskId,
              userName: name,
              note: note || null,
              startAt: start,
              endAt: end,
            },
          });
        }
      }
    });

    await publishDeskEvent({
      type: "desk-updated",
      deskId,
      actorName: name,
      active: action === "claim",
      at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("FORBIDDEN_DAY:")) {
      const dayIndex = Number(error.message.split(":")[1] ?? "1");
      return NextResponse.json(
        { error: `Слот ${WEEKDAY_LABELS[dayIndex - 1]} занят другим сотрудником` },
        { status: 403 },
      );
    }

    if (error instanceof Error && error.message.startsWith("OCCUPIED_DAY:")) {
      const dayIndex = Number(error.message.split(":")[1] ?? "1");
      return NextResponse.json(
        { error: `Слот ${WEEKDAY_LABELS[dayIndex - 1]} уже занят` },
        { status: 409 },
      );
    }

    if (isDatabaseUnavailableError(error)) {
      const fallbackResult = claimFallbackDesk({
        deskId,
        name,
        note,
        action,
        days: uniqueDays,
        anchorDate,
        repeatWeeks,
        knownDeskIds,
      });

      if (!fallbackResult.ok) {
        return NextResponse.json(
          { error: fallbackResult.error },
          { status: fallbackResult.status },
        );
      }

      await publishDeskEvent({
        type: "desk-updated",
        deskId,
        actorName: name,
        active: action === "claim",
        at: new Date().toISOString(),
      });

      return NextResponse.json({ ok: true, fallback: true });
    }

    console.error("POST /api/claim failed", error);
    return NextResponse.json({ error: "Не удалось обновить состояние стола" }, { status: 500 });
  }
}
