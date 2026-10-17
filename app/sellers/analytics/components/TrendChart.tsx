"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsMetric, TimeseriesPoint } from "@/lib/api/analytics";
import { formatNaira } from "@/lib/labels";

const SELLER_MAIN = "#13368B"; // --seller-main
const dayLabel = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "UTC" });
const compact = new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 });

// Revenue comes in kobo; the axis and tooltip show naira
const axisValue = (metric: AnalyticsMetric, value: number) => (metric === "revenue" ? `₦${compact.format(value / 100)}` : compact.format(value));
const tipValue = (metric: AnalyticsMetric, value: number) =>
  metric === "revenue" ? formatNaira(value) : `${value.toLocaleString("en-NG")} ${metric === "orders" ? (value === 1 ? "order" : "orders") : value === 1 ? "view" : "views"}`;

// Guide 7.2.3: one point per Lagos day. Loaded only on the analytics page, to keep the app small.
export default function TrendChart({ data, metric, height = 200 }: { data: TimeseriesPoint[]; metric: AnalyticsMetric; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => dayLabel.format(new Date(`${d}T00:00:00Z`))}
          tick={{ fontSize: 11, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          tickFormatter={(v: number) => axisValue(metric, v)}
          tick={{ fontSize: 11, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          labelFormatter={(d) => dayLabel.format(new Date(`${String(d)}T00:00:00Z`))}
          formatter={(v) => [tipValue(metric, Number(v)), null]}
        />
        <Line type="monotone" dataKey="value" stroke={SELLER_MAIN} strokeWidth={2.5} dot={data.length <= 31} />
      </LineChart>
    </ResponsiveContainer>
  );
}
