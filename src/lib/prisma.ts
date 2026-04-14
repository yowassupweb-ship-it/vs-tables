import { PrismaPg } from "@prisma/adapter-pg";
import * as PrismaClientPkg from "@prisma/client";

const PrismaClient = (PrismaClientPkg as unknown as { PrismaClient: new (...args: any[]) => any }).PrismaClient;
type PrismaClientInstance = InstanceType<typeof PrismaClient>;

declare global {
  var prisma: PrismaClientInstance | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const adapter = new PrismaPg({ connectionString });

export const prisma =
  global.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
