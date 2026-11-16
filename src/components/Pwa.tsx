"use client";

import { useEffect } from "react";
import { flushOutbox } from "@/lib/offline";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const flush = () => flushOutbox().catch(() => undefined);
    flush();
    window.addEventListener("online", flush);
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "flush-outbox") flush();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("online", flush);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);
  return null;
}
