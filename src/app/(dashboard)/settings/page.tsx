"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Info, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

interface SettingsResponse {
  llm: {
    provider: string;
    apiKeyHint: string;
    hasEnvFallback: boolean;
  };
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyHint: string;
    secretKeyHint: string;
    pathPrefix: string;
    forcePathStyle: boolean;
    hasEnvFallback: boolean;
  };
}

type ConnectionStatus = "idle" | "testing" | "success" | "error";

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Connection status
  const [llmStatus, setLlmStatus] = useState<ConnectionStatus>("idle");
  const [s3Status, setS3Status] = useState<ConnectionStatus>("idle");
  const [llmError, setLlmError] = useState("");
  const [s3Error, setS3Error] = useState("");

  // LLM form state
  const [llmProvider, setLlmProvider] = useState("anthropic");
  const [llmApiKey, setLlmApiKey] = useState("");

  // S3 form state
  const [s3Endpoint, setS3Endpoint] = useState("");
  const [s3Region, setS3Region] = useState("");
  const [s3Bucket, setS3Bucket] = useState("");
  const [s3AccessKey, setS3AccessKey] = useState("");
  const [s3SecretKey, setS3SecretKey] = useState("");
  const [s3PathPrefix, setS3PathPrefix] = useState("");
  const [s3ForcePathStyle, setS3ForcePathStyle] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to load settings");
      const data: SettingsResponse = await res.json();
      setSettings(data);
      setLlmProvider(data.llm?.provider || "anthropic");
      setS3Endpoint(data.s3?.endpoint || "");
      setS3Region(data.s3?.region || "");
      setS3Bucket(data.s3?.bucket || "");
      setS3PathPrefix(data.s3?.pathPrefix || "");
      setS3ForcePathStyle(data.s3?.forcePathStyle || false);
      // API keys are write-only, always start empty
      setLlmApiKey("");
      setS3AccessKey("");
      setS3SecretKey("");
    } catch (err) {
      console.error("Failed to load settings:", err);
      toast.error("Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // ----- Test helpers (shared by test button + save) -----

  async function testLlmConnection(
    provider: string,
    apiKey: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "llm", provider, apiKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || "Connection test failed" };
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }

  async function testS3Connection(params: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "s3", ...params }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || "Connection test failed" };
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }

  // ----- Save handlers -----

  const handleSaveLlm = async () => {
    // If a new key was entered, validate it first
    if (llmApiKey) {
      setLlmStatus("testing");
      setLlmError("");
      const result = await testLlmConnection(llmProvider, llmApiKey);
      if (!result.ok) {
        setLlmStatus("error");
        setLlmError(result.error || "Connection test failed");
        toast.error("Key validation failed: " + result.error);
        return;
      }
      setLlmStatus("success");
    }

    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        llm: {
          provider: llmProvider,
          ...(llmApiKey ? { apiKey: llmApiKey } : {}),
        },
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save settings");
      }
      toast.success(llmApiKey ? "Settings saved — key verified" : "Settings saved");
      await fetchSettings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveS3 = async () => {
    // If new keys were entered, validate the connection first
    if (s3AccessKey && s3SecretKey && s3Endpoint && s3Region && s3Bucket) {
      setS3Status("testing");
      setS3Error("");
      const result = await testS3Connection({
        endpoint: s3Endpoint,
        region: s3Region,
        bucket: s3Bucket,
        accessKey: s3AccessKey,
        secretKey: s3SecretKey,
        forcePathStyle: s3ForcePathStyle,
      });
      if (!result.ok) {
        setS3Status("error");
        setS3Error(result.error || "Connection test failed");
        toast.error("Connection validation failed: " + result.error);
        return;
      }
      setS3Status("success");
    }

    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        s3: {
          endpoint: s3Endpoint,
          region: s3Region,
          bucket: s3Bucket,
          pathPrefix: s3PathPrefix,
          forcePathStyle: s3ForcePathStyle,
          ...(s3AccessKey ? { accessKey: s3AccessKey } : {}),
          ...(s3SecretKey ? { secretKey: s3SecretKey } : {}),
        },
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save settings");
      }
      toast.success(
        s3AccessKey ? "Settings saved — connection verified" : "Settings saved"
      );
      await fetchSettings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  // ----- Test handlers -----

  const handleTestLlm = async () => {
    if (!llmApiKey) {
      toast.error("Enter an API key to test the connection");
      return;
    }
    setLlmStatus("testing");
    setLlmError("");
    const result = await testLlmConnection(llmProvider, llmApiKey);
    if (result.ok) {
      setLlmStatus("success");
      toast.success("Connection successful!");
    } else {
      setLlmStatus("error");
      setLlmError(result.error || "Connection test failed");
      toast.error("Connection failed: " + result.error);
    }
  };

  const handleTestS3 = async () => {
    if (!s3Endpoint || !s3Region || !s3Bucket || !s3AccessKey || !s3SecretKey) {
      toast.error(
        "Fill in all required fields (endpoint, region, bucket, access key, secret key) to test"
      );
      return;
    }
    setS3Status("testing");
    setS3Error("");
    const result = await testS3Connection({
      endpoint: s3Endpoint,
      region: s3Region,
      bucket: s3Bucket,
      accessKey: s3AccessKey,
      secretKey: s3SecretKey,
      forcePathStyle: s3ForcePathStyle,
    });
    if (result.ok) {
      setS3Status("success");
      toast.success("Connection successful!");
    } else {
      setS3Status("error");
      setS3Error(result.error || "Connection test failed");
      toast.error("Connection failed: " + result.error);
    }
  };

  // ----- Status badge component -----

  function StatusBadge({
    status,
    error,
  }: {
    status: ConnectionStatus;
    error: string;
  }) {
    if (status === "testing") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Verifying...
        </span>
      );
    }
    if (status === "success") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Connected
        </span>
      );
    }
    if (status === "error") {
      return (
        <span
          className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"
          title={error}
        >
          <XCircle className="h-3.5 w-3.5" />
          Failed
        </span>
      );
    }
    return null;
  }

  // ----- Loading state -----

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-5 w-80" />
        </div>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Configure your LLM and storage providers
        </p>
      </div>

      <Tabs defaultValue="llm" className="w-full">
        <TabsList>
          <TabsTrigger value="llm">LLM Configuration</TabsTrigger>
          <TabsTrigger value="s3">Object Storage</TabsTrigger>
        </TabsList>

        {/* =============== LLM Tab =============== */}
        <TabsContent value="llm">
          <Card>
            <CardHeader>
              <CardTitle>LLM Provider</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Provider Select */}
              <div className="space-y-2">
                <Label htmlFor="llm-provider">Provider</Label>
                <Select value={llmProvider} onValueChange={setLlmProvider}>
                  <SelectTrigger className="w-[280px]" id="llm-provider">
                    <SelectValue placeholder="Select a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anthropic">Anthropic Claude</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* API Key */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="llm-api-key">API Key</Label>
                  <StatusBadge status={llmStatus} error={llmError} />
                </div>
                <Input
                  id="llm-api-key"
                  type="password"
                  value={llmApiKey}
                  onChange={(e) => {
                    setLlmApiKey(e.target.value);
                    if (llmStatus !== "idle") {
                      setLlmStatus("idle");
                      setLlmError("");
                    }
                  }}
                  placeholder={
                    settings?.llm?.apiKeyHint
                      ? `Current key: ${settings.llm?.apiKeyHint}`
                      : "Enter your API key"
                  }
                  className="max-w-md"
                />
              </div>

              {/* Info text */}
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Your API key is encrypted at rest and never displayed after
                  saving. Leave blank to keep the existing key.
                </p>
              </div>

              {/* No env fallback warning */}
              {settings &&
                !settings.llm?.hasEnvFallback &&
                !settings.llm?.apiKeyHint && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50 p-3 dark:bg-amber-950/20">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      No system API key configured. Add your own key to enable
                      AI analysis.
                    </p>
                  </div>
                )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSaveLlm}
                  disabled={isSaving || llmStatus === "testing"}
                >
                  {(isSaving || llmStatus === "testing") && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {llmApiKey ? "Validate & Save" : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTestLlm}
                  disabled={llmStatus === "testing"}
                >
                  {llmStatus === "testing" && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Test Connection
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* =============== S3 Tab =============== */}
        <TabsContent value="s3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Object Storage (S3-Compatible)</CardTitle>
                <StatusBadge status={s3Status} error={s3Error} />
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                {/* Endpoint */}
                <div className="space-y-2">
                  <Label htmlFor="s3-endpoint">Endpoint URL</Label>
                  <Input
                    id="s3-endpoint"
                    value={s3Endpoint}
                    onChange={(e) => {
                      setS3Endpoint(e.target.value);
                      if (s3Status !== "idle") {
                        setS3Status("idle");
                        setS3Error("");
                      }
                    }}
                    placeholder="https://s3.amazonaws.com"
                  />
                </div>

                {/* Region */}
                <div className="space-y-2">
                  <Label htmlFor="s3-region">Region</Label>
                  <Input
                    id="s3-region"
                    value={s3Region}
                    onChange={(e) => {
                      setS3Region(e.target.value);
                      if (s3Status !== "idle") {
                        setS3Status("idle");
                        setS3Error("");
                      }
                    }}
                    placeholder="us-east-1"
                  />
                </div>

                {/* Bucket */}
                <div className="space-y-2">
                  <Label htmlFor="s3-bucket">Bucket Name</Label>
                  <Input
                    id="s3-bucket"
                    value={s3Bucket}
                    onChange={(e) => {
                      setS3Bucket(e.target.value);
                      if (s3Status !== "idle") {
                        setS3Status("idle");
                        setS3Error("");
                      }
                    }}
                    placeholder="my-logshield-bucket"
                  />
                </div>

                {/* Path Prefix */}
                <div className="space-y-2">
                  <Label htmlFor="s3-prefix">Path Prefix (optional)</Label>
                  <Input
                    id="s3-prefix"
                    value={s3PathPrefix}
                    onChange={(e) => setS3PathPrefix(e.target.value)}
                    placeholder="logshield/"
                  />
                </div>

                {/* Access Key */}
                <div className="space-y-2">
                  <Label htmlFor="s3-access-key">Access Key</Label>
                  <Input
                    id="s3-access-key"
                    type="password"
                    value={s3AccessKey}
                    onChange={(e) => {
                      setS3AccessKey(e.target.value);
                      if (s3Status !== "idle") {
                        setS3Status("idle");
                        setS3Error("");
                      }
                    }}
                    placeholder={
                      settings?.s3?.accessKeyHint
                        ? `Current: ${settings.s3?.accessKeyHint}`
                        : "Enter access key"
                    }
                  />
                </div>

                {/* Secret Key */}
                <div className="space-y-2">
                  <Label htmlFor="s3-secret-key">Secret Key</Label>
                  <Input
                    id="s3-secret-key"
                    type="password"
                    value={s3SecretKey}
                    onChange={(e) => {
                      setS3SecretKey(e.target.value);
                      if (s3Status !== "idle") {
                        setS3Status("idle");
                        setS3Error("");
                      }
                    }}
                    placeholder={
                      settings?.s3?.secretKeyHint
                        ? `Current: ${settings.s3?.secretKeyHint}`
                        : "Enter secret key"
                    }
                  />
                </div>
              </div>

              {/* Force Path Style toggle */}
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={s3ForcePathStyle}
                  onClick={() => setS3ForcePathStyle(!s3ForcePathStyle)}
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded border transition-colors ${
                    s3ForcePathStyle
                      ? "border-primary bg-primary"
                      : "border-input bg-background"
                  } flex items-center justify-center`}
                >
                  {s3ForcePathStyle && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3 w-3 text-primary-foreground"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
                <div className="space-y-1">
                  <Label
                    className="cursor-pointer"
                    onClick={() => setS3ForcePathStyle(!s3ForcePathStyle)}
                  >
                    Force path-style addressing
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Enable for MinIO or self-hosted S3-compatible services
                  </p>
                </div>
              </div>

              {/* Info text */}
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Access keys are encrypted at rest. Leave blank to keep
                  existing keys. When not configured, files are stored locally.
                </p>
              </div>

              {settings?.s3?.hasEnvFallback && !settings.s3.accessKeyHint && (
                <div className="flex items-start gap-2 rounded-md border border-green-500/30 bg-green-50 p-3 dark:bg-green-950/20">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                  <p className="text-sm text-green-700 dark:text-green-300">
                    S3 storage is configured via environment variables. Per-user
                    settings here will override the system configuration.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSaveS3}
                  disabled={isSaving || s3Status === "testing"}
                >
                  {(isSaving || s3Status === "testing") && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {s3AccessKey && s3SecretKey ? "Validate & Save" : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTestS3}
                  disabled={s3Status === "testing"}
                >
                  {s3Status === "testing" && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Test Connection
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
