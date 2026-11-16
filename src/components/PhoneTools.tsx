"use client";

import { useEffect, useState } from "react";
import { useI18n } from "./I18nProvider";

function keyToBytes(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function PhoneTools() {
  const { t } = useI18n();
  const [installed, setInstalled] = useState(false);
  const [state, setState] = useState("");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    setInstalled(media.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function enable() {
    setState("");
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState(t("alertsUnavailable"));
      return;
    }
    if (!window.isSecureContext) {
      setState(t("alertsNeedHttps"));
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState(t("alertsBlocked"));
      return;
    }
    const config = await fetch("/api/push").then((response) => response.json());
    if (!config.publicKey) {
      setState(t("pushNotReady"));
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyToBytes(config.publicKey),
    });
    await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
    setState(t("alertsOn"));
  }

  async function test() {
    const response = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test" }) });
    setState(response.ok ? t("testSent") : t("testFailed"));
  }

  return (
    <section className="card stack">
      <h2>{t("installTitle")}</h2>
      {installed ? <p className="ok">{t("installDone")}</p> : null}
      <p className="help">{t("installIos")}</p>
      <p className="help">{t("installAndroid")}</p>
      {deferred ? <button className="btn dark" type="button" onClick={() => deferred.prompt()}>{t("installApp")}</button> : null}
      <h2>{t("phoneAlerts")}</h2>
      <p className="help">{t("phoneAlertsHelp")}</p>
      <button className="btn primary" type="button" onClick={enable}>{t("turnOnAlerts")}</button>
      <button className="btn ghost" type="button" onClick={test}>{t("sendTest")}</button>
      {state ? <p className="help">{state}</p> : null}
    </section>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}
