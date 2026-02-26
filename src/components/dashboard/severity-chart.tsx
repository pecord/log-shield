"use client";

import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SEVERITY_CHART_COLORS } from "@/lib/constants";

interface SeverityChartProps {
  data: { severity: string; count: number }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const { severity, count } = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: SEVERITY_CHART_COLORS[severity] || "#9ca3af" }}
        />
        <span className="font-medium">{severity}</span>
        <span className="text-muted-foreground ml-auto">{count}</span>
      </div>
    </div>
  );
}

export function SeverityChart({ data }: SeverityChartProps) {
  const router = useRouter();
  const filtered = data.filter((d) => d.count > 0);
  const total = filtered.reduce((sum, d) => sum + d.count, 0);

  if (filtered.length === 0) {
    return (
      <Card className="py-4">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Severity Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
          No findings to display
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-4">
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Severity Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={filtered}
              dataKey="count"
              nameKey="severity"
              cx="50%"
              cy="50%"
              outerRadius={90}
              innerRadius={55}
              paddingAngle={2}
              strokeWidth={0}
            >
              {filtered.map((entry) => (
                <Cell
                  key={entry.severity}
                  fill={SEVERITY_CHART_COLORS[entry.severity] || "#9ca3af"}
                  onClick={() => router.push(`/findings?severity=${entry.severity}`)}
                  style={{ cursor: "pointer", outline: "none" }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            {/* Center text */}
            <text
              x="50%"
              y="46%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-foreground"
              style={{ fontSize: "28px", fontWeight: 700 }}
            >
              {total}
            </text>
            <text
              x="50%"
              y="58%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              style={{ fontSize: "11px" }}
            >
              findings
            </text>
          </PieChart>
        </ResponsiveContainer>

        {/* Custom legend */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2">
          {filtered.map((entry) => (
            <button
              key={entry.severity}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => router.push(`/findings?severity=${entry.severity}`)}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: SEVERITY_CHART_COLORS[entry.severity] || "#9ca3af" }}
              />
              {entry.severity} ({entry.count})
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
