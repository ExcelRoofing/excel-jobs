type Listener = (event: unknown) => void;

const globalHub = globalThis as unknown as { __excelHub?: Map<string, Set<Listener>> };

function hub() {
  if (!globalHub.__excelHub) globalHub.__excelHub = new Map();
  return globalHub.__excelHub;
}

export function publish(channel: string, event: unknown) {
  const set = hub().get(channel);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch {
      /* a dead listener should not stop the others */
    }
  }
}

export function subscribe(channel: string, listener: Listener) {
  const map = hub();
  let set = map.get(channel);
  if (!set) {
    set = new Set();
    map.set(channel, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) map.delete(channel);
  };
}
