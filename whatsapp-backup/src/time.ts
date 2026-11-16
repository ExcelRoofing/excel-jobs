export type ZonedParts = {
  day: string;
  time: string;
  clock: string;
};

export function zonedParts(ms: number, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(ms))) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  let hour = bag.hour || "00";
  if (hour === "24") hour = "00";
  return {
    day: `${bag.year}-${bag.month}-${bag.day}`,
    time: `${hour}${bag.minute}${bag.second}`,
    clock: `${hour}:${bag.minute}:${bag.second}`,
  };
}
