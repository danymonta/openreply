"use client";

/**
 * Contacts Page
 *
 * One row per Instagram user who triggered a campaign, with their activity in
 * the period; selecting one shows everything they did (triggers and clicks).
 */

import { useI18n } from "@/lib/i18n/provider";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Contact {
  id: string;
  username: string | null;
  interactions: number;
  sent: number;
  clicks: number;
  campaigns: string[];
  sources: ("comment" | "dm" | "button")[];
  firstAt: string;
  lastAt: string;
  isNew: boolean;
}

interface ContactDetail {
  id: string;
  username: string | null;
  events: {
    type: "comment" | "dm" | "button" | "click";
    at: string;
    campaign: string;
    text: string;
    keyword: string | null;
    status: string | null;
    error: string | null;
  }[];
}

const PERIODS = [7, 30, 90, 365] as const;

export default function ContactsPage() {
  return (
    <Suspense fallback={null}>
      <Contacts />
    </Suspense>
  );
}

function Contacts() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const selectedId = useSearchParams().get("id");
  const [days, setDays] = useState<number>(30);
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ContactDetail | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ days: String(days) });
      if (search.trim()) params.set("q", search.trim());
      fetch(`/api/contacts?${params}`)
        .then((r) => r.json())
        .then((payload) => payload.success && setContacts(payload.data.contacts))
        .catch(console.error)
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [days, search]);

  useEffect(() => {
    if (!selectedId) return;
    fetch(`/api/contacts/${encodeURIComponent(selectedId)}`)
      .then((r) => r.json())
      .then((payload) => setDetail(payload.success ? payload.data : null))
      .catch(console.error);
  }, [selectedId]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const eventLabel: Record<ContactDetail["events"][number]["type"], string> = {
    comment: t("Comment"),
    dm: t("DM / Story reply"),
    button: t("Button tap"),
    click: t("Link click"),
  };

  const newCount = contacts.filter((c) => c.isNew).length;
  const clickedCount = contacts.filter((c) => c.clicks > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          {t("{count} people", { count: contacts.length })} · {t("{count} new", { count: newCount })} ·{" "}
          {t("{count} clicked a link", { count: clickedCount })}
        </p>
        <div className="inline-flex rounded-lg bg-surface p-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setLoading(true);
                setDays(p);
              }}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                days === p
                  ? "bg-background font-medium text-foreground ring-1 ring-accent/40"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t("{count} days", { count: p })}
            </button>
          ))}
        </div>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("Search by username or campaign…")}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none"
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="panel overflow-x-auto rounded p-4 lg:col-span-3">
          {loading ? (
            <p className="text-sm text-muted">{t("Loading…")}</p>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-muted">{t("No one has triggered a campaign in this period.")}</p>
          ) : (
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 font-normal">{t("Person")}</th>
                  <th className="py-1 text-right font-normal">{t("Triggers")}</th>
                  <th className="py-1 text-right font-normal">{t("DMs sent")}</th>
                  <th className="py-1 text-right font-normal">{t("Link clicks")}</th>
                  <th className="py-1 text-right font-normal">{t("Last activity")}</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => router.replace(`/contacts?id=${c.id}`)}
                    className={`cursor-pointer border-t border-border hover:bg-surface-hover ${
                      selectedId === c.id ? "bg-surface-hover" : ""
                    }`}
                  >
                    <td className="py-1.5">
                      <span className="text-foreground">{c.username ? `@${c.username}` : c.id}</span>
                      {c.isNew && (
                        <span className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                          {t("new")}
                        </span>
                      )}
                      <p className="truncate text-xs text-muted">{c.campaigns.join(", ")}</p>
                    </td>
                    <td className="py-1.5 text-right">{c.interactions}</td>
                    <td className="py-1.5 text-right">{c.sent}</td>
                    <td className="py-1.5 text-right">{c.clicks}</td>
                    <td className="py-1.5 text-right text-xs text-muted">{formatDate(c.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel rounded p-4 lg:col-span-2">
          {!detail ? (
            <p className="text-sm text-muted">{t("Select a person to see everything they did.")}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-foreground">
                  {detail.username ? `@${detail.username}` : detail.id}
                </h2>
                {detail.username && (
                  <a
                    href={`https://instagram.com/${detail.username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-accent hover:underline"
                  >
                    {t("Open on Instagram")}
                  </a>
                )}
              </div>
              <ol className="space-y-2">
                {detail.events.map((e, i) => (
                  <li key={i} className="border-l-2 border-border pl-3">
                    <p className="text-xs text-muted">
                      {formatDate(e.at)} · {eventLabel[e.type]} · {e.campaign}
                    </p>
                    <p className="text-sm text-foreground">{e.text}</p>
                    {e.status && e.status !== "SENT" && (
                      <p className={`text-xs ${e.status === "FAILED" ? "text-error" : "text-muted"}`}>
                        {e.status}
                        {e.error ? ` · ${e.error}` : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
