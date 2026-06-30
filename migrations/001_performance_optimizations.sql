-- ============================================================
-- Performance Optimizations for 1M+ Domains
-- Run AFTER Prisma migrate
-- ============================================================

-- 1. Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

-- 2. Trigram GIN index for fast partial domain name searches
-- Handles: ILIKE '%keyword%', ILIKE 'prefix%', ILIKE '%suffix'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_domains_name_trgm
  ON "Domain" USING gin (name gin_trgm_ops);

-- 3. Trigram index on TLD for TLD search/filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_domains_tld_trgm
  ON "Domain" USING gin (tld gin_trgm_ops);

-- 4. Partial index: only high-value domains (score >= 70)
-- Used by "premium domains" feed and alert matching
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_domains_high_score
  ON "Domain" (score DESC, name)
  WHERE score >= 70;

-- 5. Partial index: brandable domains only
-- Used by brandable filter when combined with other filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_domains_brandable_high_score
  ON "Domain" (score DESC, length)
  WHERE "isBrandable" = true AND score >= 50;

-- 6. BRIN index on createdAt for time-range queries
-- Much smaller than B-tree for large tables
-- Used by: "domains added in last 24h" type queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_domains_created_brin
  ON "Domain" USING brin (created_at)
  WITH (pages_per_range = 32);

-- 7. Covering index for search results (avoids table lookups)
-- The INCLUDE columns are returned directly from the index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_domains_search_covering
  ON "Domain" (tld, score DESC, length)
  INCLUDE (name, "isBrandable", "hasKeywords", backlinks, created_at);

-- 8. Index for alert matching: find active alerts by domain
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_active_domain
  ON "Alert" ("domainId", type)
  WHERE "isActive" = true;

-- 9. Composite index for trending with pre-filtered high scores
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trending_active
  ON "TrendingDomain" (rank)
  WHERE score > 0;

-- 10. Function for case-insensitive domain search with ranking
-- Returns domains sorted by relevance (trigram similarity + score)
CREATE OR REPLACE FUNCTION search_domains(
  search_query text DEFAULT '',
  filter_tld text DEFAULT NULL,
  filter_min_score int DEFAULT 0,
  filter_max_score int DEFAULT 100,
  filter_min_length int DEFAULT 1,
  filter_max_length int DEFAULT 63,
  filter_brandable boolean DEFAULT NULL,
  sort_field text DEFAULT 'score',
  sort_dir text DEFAULT 'desc',
  page_size int DEFAULT 20,
  page_num int DEFAULT 1
)
RETURNS TABLE (
  id text,
  name text,
  tld text,
  length int,
  score float,
  "isBrandable" boolean,
  "hasKeywords" boolean,
  backlinks int,
  created_at timestamp,
  relevance float
)
LANGUAGE plpgsql
AS $$
DECLARE
  offset_val int := (page_num - 1) * page_size;
  sort_clause text;
BEGIN
  -- Validate and build sort clause (prevents SQL injection)
  sort_clause := CASE
    WHEN sort_field = 'score' AND sort_dir = 'asc' THEN 'd.score ASC'
    WHEN sort_field = 'score' AND sort_dir = 'desc' THEN 'd.score DESC'
    WHEN sort_field = 'length' AND sort_dir = 'asc' THEN 'd.length ASC'
    WHEN sort_field = 'length' AND sort_dir = 'desc' THEN 'd.length DESC'
    WHEN sort_field = 'name' AND sort_dir = 'asc' THEN 'd.name ASC'
    WHEN sort_field = 'name' AND sort_dir = 'desc' THEN 'd.name DESC'
    WHEN sort_field = 'createdAt' AND sort_dir = 'asc' THEN 'd.created_at ASC'
    WHEN sort_field = 'createdAt' AND sort_dir = 'desc' THEN 'd.created_at DESC'
    ELSE 'd.score DESC'
  END;

  RETURN QUERY EXECUTE format(
    'SELECT
      d.id::text,
      d.name::text,
      d.tld::text,
      d.length,
      d.score::float,
      d."isBrandable",
      d."hasKeywords",
      d.backlinks,
      d.created_at::timestamp,
      CASE WHEN $1 != %L THEN similarity(d.name, $1) ELSE 0 END::float AS relevance
    FROM "Domain" d
    WHERE ($1 = %L OR d.name ILIKE %L)
      AND ($2 IS NULL OR d.tld = $2)
      AND d.score >= $3 AND d.score <= $4
      AND d.length >= $5 AND d.length <= $6
      AND ($7 IS NULL OR d."isBrandable" = $7)
    ORDER BY %s
    LIMIT $8 OFFSET $9',
    '', '', '%' || search_query || '%',
    sort_clause
  )
  USING
    search_query,
    search_query,
    filter_tld,
    filter_min_score::int,
    filter_max_score::int,
    filter_min_length::int,
    filter_max_length::int,
    filter_brandable,
    page_size::int,
    offset_val::int;
END;
$$;

-- 11. Trigger: auto-update domain search vector on insert/update
-- Uses pg_trgm for similarity-based ranking
CREATE OR REPLACE FUNCTION update_domain_search_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.length := length(NEW.name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_domain_search_fields ON "Domain";
CREATE TRIGGER trg_domain_search_fields
  BEFORE INSERT OR UPDATE OF name
  ON "Domain"
  FOR EACH ROW
  EXECUTE FUNCTION update_domain_search_fields();

-- 12. Table statistics update hint for query planner
ANALYZE "Domain";
ANALYZE "Favorite";
ANALYZE "Alert";
ANALYZE "TrendingDomain";

-- ============================================================
-- Usage Notes:
-- 1. Run `npx prisma migrate deploy` first
-- 2. Then run this SQL against your database
-- 3. For bulk imports, DROP the trigram indexes first,
--    import data, then CREATE them CONCURRENTLY
-- ============================================================
