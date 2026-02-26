"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TimelineChartProps {
  data: { date: string; critical: number; high: number; other: number }[];
  onDateClick?: (date: string, severity?: string) => void;
}

const COLORS = {
  critical: "#ef4444",
  high: "#f97316",
  other: "#3b82f6",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry: { name: string; value: number; color: string }) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-medium">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function TimelineChart({ data, onDateClick }: TimelineChartProps) {
  const hasData = data.some((d) => d.critical + d.high + d.other > 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeBarClick = (severity?: string) => (barData: any) => {
    if (onDateClick && barData?.date) {
      onDateClick(barData.date, severity);
    }
  };

  if (data.length === 0 || !hasData) {
    return (
      <Card className="col-span-full py-4">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Threat Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
          No threat data available
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-full py-4">
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Threat Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={data}
            maxBarSize={48}
            style={{ cursor: onDateClick ? "pointer" : undefined }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(128,128,128,0.15)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={(v) => v.slice(5)}
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#71717a", fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Bar
              dataKey="other"
              name="Med/Low/Info"
              stackId="1"
              fill={COLORS.other}
              radius={[0, 0, 4, 4]}
              onClick={makeBarClick()}
              className="cursor-pointer"
            />
            <Bar
              dataKey="high"
              name="High"
              stackId="1"
              fill={COLORS.high}
              onClick={makeBarClick("HIGH")}
              className="cursor-pointer"
            />
            <Bar
              dataKey="critical"
              name="Critical"
              stackId="1"
              fill={COLORS.critical}
              radius={[4, 4, 0, 0]}
              onClick={makeBarClick("CRITICAL")}
              className="cursor-pointer"
            />
          </BarChart>
        </ResponsiveContainer>

        {/* Custom legend */}
        <div className="flex items-center justify-center gap-4 mt-2">
          {[
            { label: "Critical", color: COLORS.critical },
            { label: "High", color: COLORS.high },
            { label: "Med/Low/Info", color: COLORS.other },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
