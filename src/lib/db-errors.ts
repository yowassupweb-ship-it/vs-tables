export function isDatabaseUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { name?: string; code?: string };

  if (maybeError.name === "PrismaClientInitializationError") {
    return true;
  }

  if (maybeError.name === "PrismaClientKnownRequestError") {
    return ["P1000", "P1001", "P1008", "P1017"].includes(maybeError.code ?? "");
  }

  return false;
}
