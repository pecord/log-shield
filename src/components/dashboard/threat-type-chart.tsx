"use client";

import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORY_LABELS, SEVERITY_CHART_COLORS } from "@/lib/constants";

interface ThreatTypeChartProps {
  data: { category: string; count: number; maxSeverity?: string }[];
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; count: number; maxSeverity?: string } }[] }) {
  if (!active || !payload?.[0]) return null;
  const { name, count, maxSeverity } = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{name}</p>
      <p className="text-muted-foreground">{count} findings</p>
      {maxSeverity && (
        <p className="text-muted-foreground">Highest: {maxSeverity}</p>
      )}
    </div>
  );
}

export function ThreatTypeChart({ data }: ThreatTypeChartProps) {
  const router = useRouter();

  if (data.length === 0) {
    return (
      <Card className="py-4">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Threat Categories
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
          No findings to display
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    name: CATEGORY_LABELS[d.category] || d.category,
    category: d.category,
    count: d.count,
    maxSeverity: d.maxSeverity,
  }));

  const chartHeight = Math.max(220, chartData.length * 28);

  return (
    <Card className="py-4">
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Threat Categories
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 40 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(128,128,128,0.15)"
              horizontal={false}
            />
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#71717a", fontSize: 11 }}
            />
            <YAxis
              dataKey="name"
              type="category"
              width={110}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#71717a", fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Bar
              dataKey="count"
              radius={[0, 4, 4, 0]}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts Bar onClick typing is incomplete
              onClick={(barData: any) => {
                if (barData?.category) {
                  router.push(`/findings?category=${barData.category}`);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={SEVERITY_CHART_COLORS[entry.maxSeverity ?? "INFO"] ?? "#4b5563"}
                />
              ))}
              <LabelList
                dataKey="count"
                position="right"
                fill="#71717a"
                fontSize={11}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
