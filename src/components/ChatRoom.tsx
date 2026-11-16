"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./I18nProvider";
import { enqueue } from "@/lib/offline";
import { stampPhoto } from "@/lib/stamp";
import type { ChatMessage, Role } from "@/lib/types";
import { formatWhen } from "@/lib/time";

type Person = { id: string; name: string; role: Role };

export function ChatRoom({
  jobId,
  meId,
  people,
  initial,
}: {
  jobId: string;
  meId: string;
  people: Person[];
  initial: ChatMessage[];
}) {
  const { t, locale } = useI18n();
  const [messages, setMessages] = useState(initial);
  const [body, setBody] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef(initial[initial.length - 1]?.createdAt || "");
  const last = messages[messages.length - 1]?.createdAt;

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [messages.length]);

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-excel-json": "1" },
      body: JSON.stringify({ at: new Date().toISOString() }),
    }).catch(() => undefined);
  }, [jobId, last]);

  useEffect(() => {
    const add = (incoming: ChatMessage[]) => {
      setMessages((current) => {
        const ids = new Set(current.map((message) => message.id));
        const extra = incoming.filter((message) => !ids.has(message.id));
        return extra.length ? [...current, ...extra] : current;
      });
    };
    const source = new EventSource(`/api/jobs/${jobId}/stream`);
    source.onmessage = (event) => {
      const data = JSON.parse(event.data) as { type?: string; message?: ChatMessage };
      if (data.type === "message" && data.message) {
        latest.current = data.message.createdAt;
        add([data.message]);
      }
    };
    const poll = setInterval(async () => {
      const after = latest.current;
      if (!after) return;
      const response = await fetch(`/api/jobs/${jobId}/messages?after=${encodeURIComponent(after)}`).catch(() => null);
      if (!response?.ok) return;
      const data = await response.json();
      const incoming = (data.messages || []) as ChatMessage[];
      if (incoming.length) latest.current = incoming[incoming.length - 1].createdAt;
      add(incoming);
    }, 4000);
    return () => {
      source.close();
      clearInterval(poll);
    };
  }, [jobId]);

  const filtered = useMemo(() => {
    if (query == null) return [];
    const q = query.toLocaleLowerCase();
    return people.filter((person) => person.name.toLocaleLowerCase().includes(q)).slice(0, 6);
  }, [people, query]);

  function onChange(value: string, caret: number) {
    setBody(value);
    const before = value.slice(0, caret);
    const match = before.match(/@([\p{L}' ]*)$/u);
    setQuery(match ? match[1] : null);
  }

  function pick(person: Person) {
    const caret = body.length;
    const before = body.slice(0, caret);
    const match = before.match(/@([\p{L}' ]*)$/u);
    const start = match ? before.length - match[0].length : before.length;
    const next = `${body.slice(0, start)}@${person.name} ${body.slice(caret)}`;
    setBody(next);
    setQuery(null);
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text && !file) {
      setNote(t("emptyMessage"));
      return;
    }
    setSending(true);
    setNote("");
    const clientId = crypto.randomUUID();
    try {
      let response: Response;
      if (file && file.type.startsWith("image/")) {
        let blob: Blob = file;
        try {
          blob = await stampPhoto(file, locale, null);
        } catch {
          blob = file;
        }
        const form = new FormData();
        form.set("body", text);
        form.set("clientId", clientId);
        form.set("file", blob, "chat-photo.jpg");
        form.set("takenAt", new Date().toISOString());
        response = await fetch(`/api/jobs/${jobId}/messages`, { method: "POST", headers: { "x-excel-json": "1" }, body: form });
      } else if (file) {
        const form = new FormData();
        form.set("body", text);
        form.set("clientId", clientId);
        form.set("file", file);
        response = await fetch(`/api/jobs/${jobId}/messages`, { method: "POST", headers: { "x-excel-json": "1" }, body: form });
      } else {
        response = await fetch(`/api/jobs/${jobId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-excel-json": "1" },
          body: JSON.stringify({ body: text, clientId }),
        });
      }
      if (!response.ok) throw new Error("send");
      const data = await response.json();
      if (data.message) {
        latest.current = data.message.createdAt;
        setMessages((current) => (current.some((item) => item.id === data.message.id) ? current : [...current, data.message]));
      }
      setBody("");
      setFile(null);
    } catch {
      await enqueue({
        id: clientId,
        type: "message",
        jobId,
        body: text || file?.name || "",
        createdAt: new Date().toISOString(),
      });
      setNote(t("messageQueued"));
      setBody("");
      setFile(null);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat">
      <p className="help">{t("whoSees")}</p>
      <div className="chat-log" ref={box}>
        {messages.length === 0 ? <div className="empty"><h2>{t("noMessages")}</h2></div> : null}
        {messages.map((message) => {
          const mine = message.userId === meId;
          const forMe = message.mentionIds?.includes(meId);
          return (
            <article key={message.id} className={`bubble${mine ? " mine" : ""}${forMe ? " mention" : ""}`}>
              <div className="between">
                <span className="who">{mine ? t("you") : message.userName}</span>
                <span className="when">{formatWhen(message.createdAt, locale)}</span>
              </div>
              {forMe ? <div className="pill in_progress">{t("forYou")}</div> : null}
              <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{highlight(message.body, people)}</p>
              {message.files?.map((file) =>
                file.mime.startsWith("image/") ? (
                  <img key={file.id} src={`/api/files/${file.id}`} alt={file.filename} style={{ marginTop: 8, borderRadius: 12 }} />
                ) : (
                  <a key={file.id} href={`/api/files/${file.id}?download=1`}>{file.filename}</a>
                ),
              )}
            </article>
          );
        })}
      </div>
      <form className="composer" onSubmit={send}>
        {query != null ? (
          <div className="mention-menu">
            {filtered.length === 0 ? <p className="help">{t("noMatchName")}</p> : null}
            {filtered.map((person) => (
              <button type="button" className="btn ghost block" key={person.id} onClick={() => pick(person)}>
                @{person.name}
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          name="body"
          value={body}
          placeholder={t("messagePlaceholder")}
          aria-label={t("writeMessage")}
          onChange={(event) => onChange(event.target.value, event.target.selectionStart || 0)}
        />
        <div className="row">
          <label className="btn ghost">
            {t("addPhoto")}
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              hidden
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          {file ? <span>{file.name} <button type="button" onClick={() => setFile(null)}>{t("removeAttach")}</button></span> : null}
        </div>
        <p className="help">{t("mentionHint")}</p>
        {note ? <p className="banner wait">{note}</p> : null}
        <button className="btn primary block" type="submit" disabled={sending}>
          {sending ? t("workingSend") : t("send")}
        </button>
      </form>
      <noscript>
        <form className="stack" action={`/api/jobs/${jobId}/messages`} method="post">
          <textarea name="body" required placeholder={t("noscriptChat")} />
          <button className="btn primary" type="submit">{t("send")}</button>
        </form>
      </noscript>
    </div>
  );
}

function highlight(body: string, people: Person[]) {
  const names = [...people].sort((a, b) => b.name.length - a.name.length);
  const nodes: React.ReactNode[] = [];
  let rest = body;
  let key = 0;
  while (rest.length) {
    let foundAt = -1;
    let found = "";
    for (const person of names) {
      const token = `@${person.name}`;
      const at = rest.toLocaleLowerCase().indexOf(token.toLocaleLowerCase());
      if (at >= 0 && (foundAt < 0 || at < foundAt)) {
        foundAt = at;
        found = rest.slice(at, at + token.length);
      }
    }
    if (foundAt < 0) {
      nodes.push(rest);
      break;
    }
    if (foundAt > 0) nodes.push(rest.slice(0, foundAt));
    nodes.push(<mark className="mention-mark" key={key++}>{found}</mark>);
    rest = rest.slice(foundAt + found.length);
  }
  return nodes;
}
