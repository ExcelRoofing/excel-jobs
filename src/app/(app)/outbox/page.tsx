"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { flushOutbox, listOutbox, removeOutbox, type OutboxItem } from "@/lib/offline";

export default function OutboxPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [note, setNote] = useState("");

  async function refresh() {
    setItems(await listOutbox());
  }
  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  async function send() {
    const result = await flushOutbox();
    setNote(result.auth ? t("needsLogin") : result.left ? t("someLeft", { count: result.left }) : t("allSent"));
    await refresh();
  }

  return (
    <div className="stack">
      <Link href="/more">{t("back")}</Link>
      <h1>{t("outboxTitle")}</h1>
      <p className="help">{t("queueHelp")}</p>
      <p className="help">{t("howOfflineIphone")}</p>
      {note ? <p className="banner wait">{note}</p> : null}
      {items.length === 0 ? <div className="empty"><h2>{t("outboxEmpty")}</h2></div> : null}
      {items.map((item) => (
        <article key={item.id} className="card between">
          <div>
            <strong>{item.type === "photo" ? t("photoWord") : t("messageWord")}</strong>
            <div className="help">{item.note || item.body || item.filename}</div>
            {item.lastError ? <div className="help">{t("lastProblem")}: {item.lastError}</div> : null}
          </div>
          <button className="btn ghost" type="button" onClick={async () => { await removeOutbox(item.id); await refresh(); }}>{t("discard")}</button>
        </article>
      ))}
      {items.length > 0 ? <button className="btn primary block" type="button" onClick={send}>{t("sendNow")}</button> : null}
    </div>
  );
}
