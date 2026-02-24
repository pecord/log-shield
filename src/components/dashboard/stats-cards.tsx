"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, AlertTriangle, ShieldAlert, Activity } from "lucide-react";

interface StatsCardsProps {
  totalUploads: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
}

export function StatsCards({
  totalUploads,
  totalFindings,
  criticalCount,
  highCount,
}: StatsCardsProps) {
  const cards = [
    {
      title: "Total Uploads",
      value: totalUploads,
      icon: FileText,
      color: "text-blue-500",
    },
    {
      title: "Total Findings",
      value: totalFindings,
      icon: Activity,
      color: "text-yellow-500",
    },
    {
      title: "Critical Threats",
      value: criticalCount,
      icon: ShieldAlert,
      color: "text-red-500",
    },
    {
      title: "High Severity",
      value: highCount,
      icon: AlertTriangle,
      color: "text-orange-500",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
