const RANK: Record<string, number> = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

export type Logger = {
  error: (message: string, extra?: unknown) => void;
  warn: (message: string, extra?: unknown) => void;
  info: (message: string, extra?: unknown) => void;
  debug: (message: string, extra?: unknown) => void;
};

export function createLogger(level = "info"): Logger {
  const min = RANK[level] ?? RANK.info;
  const write = (name: keyof typeof RANK, message: string, extra?: unknown) => {
    if ((RANK[name] ?? 0) > min || min === 0) return;
    const line = `${new Date().toISOString()} ${name} ${message}`;
    if (extra === undefined) console.log(line);
    else console.log(line, extra instanceof Error ? extra.message : extra);
  };
  return {
    error: (message, extra) => write("error", message, extra),
    warn: (message, extra) => write("warn", message, extra),
    info: (message, extra) => write("info", message, extra),
    debug: (message, extra) => write("debug", message, extra),
  };
}
