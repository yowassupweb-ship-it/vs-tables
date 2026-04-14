import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import * as PrismaClientPkg from "@prisma/client";
import { DESK_LAYOUT } from "../src/lib/desk-layout";

const PrismaClient = (PrismaClientPkg as unknown as { PrismaClient: new (...args: any[]) => any }).PrismaClient;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
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

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
