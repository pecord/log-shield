-- Enable pg_trgm extension for trigram-based text search indexes.
-- These GIN indexes allow PostgreSQL to use index scans for ILIKE '%search%'
-- queries instead of full table scans, dramatically improving search performance
-- on the Finding table's title and description columns.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_finding_title_trgm ON "Finding" USING gin (title gin_trgm_ops);
CREATE INDEX idx_finding_desc_trgm ON "Finding" USING gin (description gin_trgm_ops);
