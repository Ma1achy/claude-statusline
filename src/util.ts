// Small shared utilities.

/** Read an env var, returning the default when unset or empty. */
export const env = (k: string, d: string): string =>
  process.env[k] !== undefined && process.env[k] !== '' ? (process.env[k] as string) : d;

/** C-like integer division (truncates toward zero) — matches the original bash math. */
export const idiv = (a: number, b: number): number => Math.trunc(a / b);

/** Always-positive modulo. */
export const mod = (a: number, b: number): number => ((a % b) + b) % b;
