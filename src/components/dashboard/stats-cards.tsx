"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

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
      label: "Uploads",
      value: totalUploads,
      color: "text-blue-500",
      accent: "#3b82f6",
      href: "/uploads",
    },
    {
      label: "Findings",
      value: totalFindings,
      color: "text-yellow-500",
      accent: "#eab308",
      href: "/findings",
    },
    {
      label: "Critical",
      value: criticalCount,
      color: "text-red-500",
      accent: "#ef4444",
      href: "/findings?severity=CRITICAL",
    },
    {
      label: "High",
      value: highCount,
      color: "text-orange-500",
      accent: "#f97316",
      href: "/findings?severity=HIGH",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Link key={card.label} href={card.href}>
          <Card
            className="card-interactive card-accent cursor-pointer"
            style={{ "--card-accent-color": card.accent } as React.CSSProperties}
          >
            <CardContent className="py-3 text-center">
              <p className={`text-2xl font-bold ${card.color}`}>
                {card.value}
              </p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
