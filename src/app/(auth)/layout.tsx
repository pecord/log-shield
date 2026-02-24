import { Shield } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-full bg-red-500/10 p-3">
            <Shield className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold">LogShield</h1>
          <p className="text-sm text-muted-foreground">
            AI-Powered Log Threat Detection
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
