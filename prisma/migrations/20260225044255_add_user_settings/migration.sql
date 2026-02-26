-- DropIndex
DROP INDEX "idx_finding_desc_trgm";

-- DropIndex
DROP INDEX "idx_finding_title_trgm";

-- AlterTable
ALTER TABLE "AnalysisResult" ADD COLUMN     "logFormat" TEXT,
ADD COLUMN     "skippedLineCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Upload" ADD COLUMN     "storageType" TEXT NOT NULL DEFAULT 'local';

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "llmProvider" TEXT,
    "llmApiKeyEncrypted" TEXT,
    "llmApiKeyHint" TEXT,
    "s3Endpoint" TEXT,
    "s3Region" TEXT,
    "s3Bucket" TEXT,
    "s3AccessKeyEncrypted" TEXT,
    "s3SecretKeyEncrypted" TEXT,
    "s3AccessKeyHint" TEXT,
    "s3SecretKeyHint" TEXT,
    "s3PathPrefix" TEXT,
    "s3ForcePathStyle" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "UserSettings_userId_idx" ON "UserSettings"("userId");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
