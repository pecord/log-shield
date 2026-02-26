-- Add eventTimestamp column to Finding table.
-- Stores the timestamp extracted from the original log line (when the security
-- event actually occurred), enabling a true event timeline on the dashboard.

ALTER TABLE "Finding" ADD COLUMN "eventTimestamp" TIMESTAMP(3);

CREATE INDEX "Finding_eventTimestamp_idx" ON "Finding"("eventTimestamp");
