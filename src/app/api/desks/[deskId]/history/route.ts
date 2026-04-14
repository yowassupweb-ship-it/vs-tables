import { NextResponse } from "next/server";
import { getDeskHistory } from "@/lib/desk-queries";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ deskId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  try {
    const { deskId } = await params;
    const points = await getDeskHistory(deskId);
    return NextResponse.json({ points });
  } catch (error) {
    console.error("GET /api/desks/[deskId]/history failed", error);
    return NextResponse.json({ error: "Не удалось загрузить историю стола" }, { status: 500 });
  }
}
