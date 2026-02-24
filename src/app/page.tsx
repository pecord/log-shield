import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Shield, Upload, BarChart3, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-red-500" />
            <span className="text-xl font-bold">LogShield</span>
          </div>
          <Link href="/signin">
            <Button>Sign In</Button>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-red-500/10 p-4">
              <Shield className="h-12 w-12 text-red-500" />
            </div>
          </div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
            AI-Powered Log
            <br />
            <span className="text-red-500">Threat Detection</span>
          </h1>
          <p className="mb-8 text-lg text-muted-foreground">
            Upload your server logs and instantly detect security threats using
            hybrid AI analysis. Combines fast rule-based pattern matching with
            LLM-powered contextual detection.
          </p>
          <Link href="/signin">
            <Button size="lg" className="text-base">
              Get Started
            </Button>
          </Link>
        </div>

        <div className="mx-auto mt-20 grid max-w-4xl gap-8 sm:grid-cols-3">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-lg bg-muted p-3">
              <Upload className="h-6 w-6" />
            </div>
            <h3 className="font-semibold">Upload Logs</h3>
            <p className="text-sm text-muted-foreground">
              Drag and drop your .txt or .log files for instant analysis.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-lg bg-muted p-3">
              <Brain className="h-6 w-6" />
            </div>
            <h3 className="font-semibold">AI Analysis</h3>
            <p className="text-sm text-muted-foreground">
              8 rule-based detectors + LLM contextual analysis with MITRE ATT&CK
              mapping.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-lg bg-muted p-3">
              <BarChart3 className="h-6 w-6" />
            </div>
            <h3 className="font-semibold">Visual Dashboard</h3>
            <p className="text-sm text-muted-foreground">
              Charts, severity breakdowns, and detailed findings at a glance.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
