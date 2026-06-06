// Small shared utilities.

/** Read an env var, returning the default when unset or empty. */
export const env = (k: string, d: string): string =>
  process.env[k] !== undefined && process.env[k] !== '' ? (process.env[k] as string) : d;

/** Opt-in toggle: true for on/1/true/yes (any case). */
export const bool = (k: string): boolean => /^(on|1|true|yes)$/i.test(env(k, ''));

/** C-like integer division (truncates toward zero) — matches the original bash math. */
export const idiv = (a: number, b: number): number => Math.trunc(a / b);

/** Always-positive modulo. */
export const mod = (a: number, b: number): number => ((a % b) + b) % b;

/** Parse an int env var with a fallback. */
export const intEnv = (k: string, d: number): number => {
  const v = parseInt(env(k, ''), 10);
  return Number.isFinite(v) ? v : d;
};
