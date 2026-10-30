"use client";

/**
 * Analytics Page
 *
 * Period totals, a daily chart, and breakdowns by campaign, folder, trigger
 * source and person. Data comes from /api/analytics.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import StatCard from "@/components/stat-card";

interface Summary {
  interactions: number;
  uniqueUsers: number;
  sent: number;
  failed: number;
  skipped: number;
  clicks: number;
  uniqueClickers: number;
  ctr: number;
}

interface AnalyticsData {
  days: number;
  totals: Summary;
  sources: { comment: number; dm: number; button: number };
  daily: { date: string; interactions: number; sent: number; clicks: number }[];
  campaigns: (Summary & {
    id: string;
    name: string;
    folder: string | null;
    isActive: boolean;
  })[];
  folders: (Summary & { name: string | null })[];
  topContacts: {
    id: string;
    username: string | null;
    interactions: number;
    sent: number;
    clicks: number;
    campaigns: string[];
    lastAt: string;
  }[];
}

const PERIODS = [7, 30, 90, 365] as const;
const SERIES = { interactions: "#f97316", sent: "#2563eb", clicks: "#16a34a" };
const GRID_COLOR = "#e4e4e7";
const AXIS_TEXT = "#71717a";

type SortKey = "interactions" | "uniqueUsers" | "sent" | "uniqueClickers" | "ctr" | "failed";

export default function AnalyticsPage() {
  const { t, locale } = useI18n();
  const [days, setDays] = useState<number>(30);
  const [folder, setFolder] = useState("");
  const [folderOptions, setFolderOptions] = useState<string[]>([]);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("interactions");

  useEffect(() => {
    const params = new URLSearchParams({ days: String(days) });
    if (folder) params.set("folder", folder);
    fetch(`/api/analytics?${params}`)
      .then((r) => r.json())
      .then((payload) => {
        if (!payload.success) return;
        setData(payload.data);
        // The folder list comes from the unfiltered view, so it stays complete
        // while one folder is selected.
        if (!folder) {
          setFolderOptions(
            (payload.data.folders as { name: string | null }[])
              .map((f) => f.name)
              .filter((name): name is string => Boolean(name))
          );
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days, folder]);

  const formatDay = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  const sortedCampaigns = [...(data?.campaigns ?? [])].sort(
    (a, b) => b[sortKey] - a[sortKey]
  );
  const sourceTotal =
    (data?.sources.comment ?? 0) + (data?.sources.dm ?? 0) + (data?.sources.button ?? 0);

  const columns: { key: SortKey; label: string }[] = [
    { key: "interactions", label: t("Triggers") },
    { key: "uniqueUsers", label: t("People") },
    { key: "sent", label: t("DMs sent") },
    { key: "uniqueClickers", label: t("Clicked") },
    { key: "ctr", label: t("CTR") },
    { key: "failed", label: t("Failed") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-muted">
          {t("Every comment, Story reply, DM and button tap your campaigns answered.")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {folderOptions.length > 0 && (
            <select
              value={folder}
              onChange={(e) => {
                setLoading(true);
                setFolder(e.target.value);
              }}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              <option value="">{t("All campaigns")}</option>
              {folderOptions.map((f) => (
                <option key={f} value={f}>
                  📁 {f}
                </option>
              ))}
            </select>
          )}
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
      </div>

      {loading || !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="panel h-24 rounded" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <StatCard label={t("Triggers")} value={data.totals.interactions.toLocaleString(locale)} />
            <StatCard label={t("People")} value={data.totals.uniqueUsers.toLocaleString(locale)} />
            <StatCard label={t("DMs sent")} value={data.totals.sent.toLocaleString(locale)} />
            <StatCard label={t("Link clicks")} value={data.totals.clicks.toLocaleString(locale)} />
            <StatCard label={t("People who clicked")} value={`${data.totals.uniqueClickers} · ${data.totals.ctr}%`} />
            <StatCard label={t("Failed")} value={data.totals.failed.toLocaleString(locale)} />
          </div>

          <div className="panel rounded p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-foreground">{t("Day by day")}</h2>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily}>
                  <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDay}
                    tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                    minTickGap={16}
                  />
                  <YAxis allowDecimals={false} tick={{ fill: AXIS_TEXT, fontSize: 11 }} width={32} />
                  <Tooltip labelFormatter={(value) => formatDay(String(value))} />
                  <Legend />
                  <Bar dataKey="interactions" name={t("Triggers")} fill={SERIES.interactions} />
                  <Bar dataKey="sent" name={t("DMs sent")} fill={SERIES.sent} />
                  <Bar dataKey="clicks" name={t("Link clicks")} fill={SERIES.clicks} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="panel rounded p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-foreground">{t("Where they came from")}</h2>
              <div className="mt-4 space-y-3">
                {(
                  [
                    ["comment", t("Comments")],
                    ["dm", t("DMs and Story replies")],
                    ["button", t("Button taps")],
                  ] as const
                ).map(([key, name]) => {
                  const value = data.sources[key];
                  const share = sourceTotal ? Math.round((value / sourceTotal) * 100) : 0;
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground">{name}</span>
                        <span className="text-muted">
                          {value} · {share}%
                        </span>
                      </div>
                      <div className="mt-1 h-2 rounded bg-surface-hover">
                        <div className="h-2 rounded bg-accent" style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel rounded p-4 sm:p-6 lg:col-span-2">
              <h2 className="text-sm font-semibold text-foreground">{t("By folder")}</h2>
              <table className="mt-3 w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1 font-normal">{t("Folder")}</th>
                    <th className="py-1 text-right font-normal">{t("Triggers")}</th>
                    <th className="py-1 text-right font-normal">{t("People")}</th>
                    <th className="py-1 text-right font-normal">{t("Clicked")}</th>
                    <th className="py-1 text-right font-normal">{t("CTR")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.folders.map((f) => (
                    <tr key={f.name ?? ""} className="border-t border-border">
                      <td className="py-1.5 text-foreground">{f.name ? `📁 ${f.name}` : t("No folder")}</td>
                      <td className="py-1.5 text-right">{f.interactions}</td>
                      <td className="py-1.5 text-right">{f.uniqueUsers}</td>
                      <td className="py-1.5 text-right">{f.uniqueClickers}</td>
                      <td className="py-1.5 text-right">{f.ctr}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel overflow-x-auto rounded p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-foreground">{t("By campaign")}</h2>
            <table className="mt-3 w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 font-normal">{t("Campaign")}</th>
                  {columns.map((c) => (
                    <th key={c.key} className="py-1 text-right font-normal">
                      <button
                        type="button"
                        onClick={() => setSortKey(c.key)}
                        className={sortKey === c.key ? "font-medium text-foreground" : "hover:text-foreground"}
                      >
                        {c.label}
                        {sortKey === c.key ? " ↓" : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedCampaigns.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-1.5">
                      <Link href={`/campaigns/${c.id}`} className="text-foreground hover:text-accent">
                        {c.name}
                      </Link>
                      <span className="ml-2 text-xs text-muted">
                        {c.folder ? `📁 ${c.folder}` : ""}
                        {c.isActive ? "" : ` · ${t("Paused")}`}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">{c.interactions}</td>
                    <td className="py-1.5 text-right">{c.uniqueUsers}</td>
                    <td className="py-1.5 text-right">{c.sent}</td>
                    <td className="py-1.5 text-right">{c.uniqueClickers}</td>
                    <td className="py-1.5 text-right">{c.ctr}%</td>
                    <td className={`py-1.5 text-right ${c.failed ? "text-error" : ""}`}>{c.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel overflow-x-auto rounded p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{t("Most active people")}</h2>
              <Link href="/contacts" className="text-sm text-accent hover:underline">
                {t("All contacts")}
              </Link>
            </div>
            <table className="mt-3 w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 font-normal">{t("Person")}</th>
                  <th className="py-1 text-right font-normal">{t("Triggers")}</th>
                  <th className="py-1 text-right font-normal">{t("Link clicks")}</th>
                  <th className="py-1 font-normal">{t("Campaigns")}</th>
                </tr>
              </thead>
              <tbody>
                {data.topContacts.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-1.5">
                      <Link href={`/contacts?id=${c.id}`} className="text-foreground hover:text-accent">
                        {c.username ? `@${c.username}` : c.id}
                      </Link>
                    </td>
                    <td className="py-1.5 text-right">{c.interactions}</td>
                    <td className="py-1.5 text-right">{c.clicks}</td>
                    <td className="py-1.5 pl-4 text-xs text-muted">{c.campaigns.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
