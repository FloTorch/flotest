const enabled =
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== "dumb" &&
  (process.stdout.isTTY ?? false);

const wrap = (code: string, close: string) =>
  enabled ? (s: string) => `\x1b[${code}m${s}\x1b[${close}m` : (s: string) => s;

export const bold = wrap("1", "22");
export const dim = wrap("2", "22");
export const red = wrap("31", "39");
export const green = wrap("32", "39");
export const yellow = wrap("33", "39");
export const cyan = wrap("36", "39");
export const magenta = wrap("35", "39");
