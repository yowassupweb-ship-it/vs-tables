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

const claimSchema = z
  .object({
    deskId: z.string().min(1),
    name: z.string().trim().max(80).optional().default(""),
    note: z.string().trim().max(140).optional().default(""),
    action: z.enum(["claim", "release"]),
    days: z.array(z.number().int().min(1).max(7)).min(1),
    workModeByDay: z.record(z.string(), z.enum(["office", "remote"]))
      .optional()
      .default({}),
    anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    repeatWeeks: z.number().int().min(1).max(26).optional().default(1),
  })
  .superRefine((value, ctx) => {
    if (value.action !== "claim") {
      return;
    }

    if (value.name.length < 5 || !fullNameRegex.test(value.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите имя и фамилию",
        path: ["name"],
      });
    }
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

  const { deskId, name, note, action, days, workModeByDay, anchorDate, repeatWeeks } = parsed.data;
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
        workModeByDay,
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

            await tx.deskReservation.delete({ where: { id: existing.id } });
            continue;
          }

          const workMode = workModeByDay[String(dayIndex)] ?? "office";

          if (existing && existing.userName !== name) {
            throw new Error(`OCCUPIED_DAY:${dayIndex}`);
          }

          if (existing && existing.userName === name) {
            await tx.deskReservation.update({
              where: { id: existing.id },
              data: {
                note: note || null,
                workMode,
              },
            });
            continue;
          }

          await tx.deskReservation.create({
            data: {
              deskId,
              userName: name,
              note: note || null,
              workMode,
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
      actorName: name || "system",
      active: action === "claim",
      at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
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
        workModeByDay,
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
        actorName: name || "system",
        active: action === "claim",
        at: new Date().toISOString(),
      });

      return NextResponse.json({ ok: true, fallback: true });
    }

    console.error("POST /api/claim failed", error);
    return NextResponse.json({ error: "Не удалось обновить состояние стола" }, { status: 500 });
  }
}
