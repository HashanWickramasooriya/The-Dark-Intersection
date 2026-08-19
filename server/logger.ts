function ts(): string {
  return new Date().toISOString().split("T")[1].replace("Z", "");
}

export const log = {
  info: (...args: unknown[]) => console.log(`[${ts()}]`, ...args),
  warn: (...args: unknown[]) => console.warn(`[${ts()}]`, ...args),
  error: (...args: unknown[]) => console.error(`[${ts()}]`, ...args),
};
