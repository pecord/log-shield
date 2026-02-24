"use client";

import Link from "next/link";
import { Shield, Upload, Search, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const steps = [
  {
    icon: Upload,
    title: "Upload",
    description: "Upload a .txt or .log file containing server, application, or network logs.",
  },
  {
    icon: Search,
    title: "Analyze",
    description: "Our AI engine scans for security threats, anomalies, and suspicious patterns.",
  },
  {
    icon: ClipboardList,
    title: "Review",
    description: "Get a detailed report with severity ratings, categories, and recommendations.",
  },
];

export function WelcomeCard() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 py-8">
      <div className="flex flex-col items-center text-center">
        <Shield className="mb-4 h-16 w-16 text-red-500" />
        <h2 className="text-3xl font-bold tracking-tight">
          Welcome to LogShield
        </h2>
        <p className="mt-2 text-muted-foreground">
          AI-powered log file threat detection. Upload your logs and get
          instant security analysis.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-6 text-center text-sm font-medium text-muted-foreground uppercase tracking-wide">
            How it works
          </h3>
          <div className="grid gap-6 sm:grid-cols-3">
            {steps.map((step, i) => (
              <div key={i} className="flex flex-col items-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <step.icon className="h-6 w-6 text-primary" />
                </div>
                <h4 className="mb-1 text-sm font-semibold">{step.title}</h4>
                <p className="text-xs text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Link href="/uploads">
          <Button size="lg">
            <Upload className="mr-2 h-4 w-4" />
            Upload Your First Log File
          </Button>
        </Link>
      </div>
    </div>
  );
}
