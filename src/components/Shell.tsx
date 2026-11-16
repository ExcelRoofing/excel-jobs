"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "./I18nProvider";
import { listOutbox } from "@/lib/offline";
import type { Role } from "@/lib/types";

function RoofMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 16 L16 6 L28 16 V18 L16 8 L4 18 Z" fill="#d4652f" />
      <path d="M8 18 H24 V28 H8 Z" fill="#f4efe7" />
      <path d="M14 22 H18 V28 H14 Z" fill="#d4652f" />
    </svg>
  );
}

export function Shell({
  name,
  role,
  alerts,
  chats,
  children,
}: {
  name: string;
  role: Role;
  alerts: number;
  chats: number;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const { t, locale } = useI18n();
  const [counts, setCounts] = useState({ alerts, chats });
  const [waiting, setWaiting] = useState(0);
  const hideNav = /\/(chat|capture)$/.test(path);

  useEffect(() => setCounts({ alerts, chats }), [alerts, chats]);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const response = await fetch("/api/me").catch(() => null);
      if (!response?.ok || stop) return;
      const data = await response.json();
      if (data.summary) setCounts(data.summary);
    };
    const timer = setInterval(tick, 8000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const load = () => listOutbox().then((items) => setWaiting(items.length)).catch(() => undefined);
    load();
    window.addEventListener("excel-outbox", load);
    window.addEventListener("online", load);
    return () => {
      window.removeEventListener("excel-outbox", load);
      window.removeEventListener("online", load);
    };
  }, []);

  const item = (href: string, label: string, icon: string, count = 0) => (
    <Link href={href} className={path === href || path.startsWith(`${href}/`) ? "on" : ""}>
      <Icon name={icon} />
      {label}
      {count > 0 ? <span className="dot">{count > 99 ? "99" : count}</span> : null}
    </Link>
  );

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/jobs" className="brand" aria-label={t("logoLabel")}>
          <RoofMark />
          <span>
            {t("appName")}
            <small>{name.split(" ")[0]}</small>
          </span>
        </Link>
        <form action="/api/locale" method="post" className="langs" aria-label={t("langLabel")}>
          <input type="hidden" name="next" value={path} />
          <button name="locale" value="en" className={locale === "en" ? "on" : ""} type="submit">
            EN
          </button>
          <button name="locale" value="fr" className={locale === "fr" ? "on" : ""} type="submit">
            FR
          </button>
        </form>
      </header>
      <div className={hideNav ? "main" : "main with-nav"}>
        {waiting > 0 ? (
          <p className="banner wait">
            {t("outboxBanner", { count: waiting })} <Link href="/outbox">{t("viewWaiting")}</Link>
          </p>
        ) : null}
        {children}
      </div>
      {hideNav ? null : (
        <nav className="nav" aria-label={t("navLabel")}>
          {item("/jobs", t("jobs"), "jobs")}
          {item("/chats", t("chats"), "chats", counts.chats)}
          {item("/alerts", t("alerts"), "alerts", counts.alerts)}
          {item("/more", t("more"), "more")}
        </nav>
      )}
      <span hidden>{role}</span>
    </div>
  );
}

function Icon({ name }: { name: string }) {
  const common = { viewBox: "0 0 32 32", fill: "none", stroke: "currentColor", strokeWidth: 2.2, "aria-hidden": true };
  if (name === "jobs") {
    return (
      <svg {...common}>
        <path d="M4 15 L16 5 L28 15" />
        <path d="M8 15 V27 H24 V15" />
      </svg>
    );
  }
  if (name === "chats") {
    return (
      <svg {...common}>
        <path d="M6 8 H26 V22 H12 L6 26 Z" />
      </svg>
    );
  }
  if (name === "alerts") {
    return (
      <svg {...common}>
        <path d="M8 22 H24 L22 12 A6 6 0 0 0 10 12 Z" />
        <path d="M13 22 a3 3 0 0 0 6 0" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="16" cy="12" r="4" />
      <path d="M8 26c1.5-4 4-6 8-6s6.5 2 8 6" />
    </svg>
  );
}
