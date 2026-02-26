import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import type { S3Config } from "./storage-s3";

export interface ResolvedUserSettings {
  llmApiKey: string | null;
  llmProvider: string | null;
  s3Config: S3Config | null;
}

/** Build S3Config from environment variables, if all required vars are set. */
export function getS3ConfigFromEnv(): S3Config | null {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;

  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    pathPrefix: process.env.S3_PATH_PREFIX || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  };
}

export async function resolveUserSettings(
  userId: string
): Promise<ResolvedUserSettings> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
  });

  if (!settings) {
    return { llmApiKey: null, llmProvider: null, s3Config: getS3ConfigFromEnv() };
  }

  const llmApiKey = settings.llmApiKeyEncrypted
    ? decrypt(settings.llmApiKeyEncrypted)
    : null;

  // User settings take priority over env vars
  const s3Config: S3Config | null =
    settings.s3Endpoint &&
    settings.s3Region &&
    settings.s3Bucket &&
    settings.s3AccessKeyEncrypted &&
    settings.s3SecretKeyEncrypted
      ? {
          endpoint: settings.s3Endpoint,
          region: settings.s3Region,
          bucket: settings.s3Bucket,
          accessKeyId: decrypt(settings.s3AccessKeyEncrypted),
          secretAccessKey: decrypt(settings.s3SecretKeyEncrypted),
          pathPrefix: settings.s3PathPrefix ?? undefined,
          forcePathStyle: settings.s3ForcePathStyle,
        }
      : getS3ConfigFromEnv();

  return {
    llmApiKey,
    llmProvider: settings.llmProvider,
    s3Config,
  };
}
