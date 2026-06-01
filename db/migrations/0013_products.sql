CREATE TABLE IF NOT EXISTS products (
  name         text PRIMARY KEY,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_last_used_idx
  ON products (last_used_at DESC);

INSERT INTO products (name, last_used_at, created_at)
SELECT
  trim(metadata->>'product') AS name,
  max(occurred_at) AS last_used_at,
  min(created_at) AS created_at
FROM events
WHERE metadata ? 'product'
  AND trim(metadata->>'product') <> ''
GROUP BY trim(metadata->>'product')
ON CONFLICT (name) DO UPDATE
  SET last_used_at = GREATEST(products.last_used_at, EXCLUDED.last_used_at);

INSERT INTO products (name, last_used_at, created_at)
SELECT
  trim(metadata->>'product') AS name,
  max(occurred_at) AS last_used_at,
  min(created_at) AS created_at
FROM events
WHERE metadata ? 'product'
  AND trim(metadata->>'product') <> ''
GROUP BY trim(metadata->>'product')
ON CONFLICT (name) DO UPDATE
  SET last_used_at = GREATEST(products.last_used_at, EXCLUDED.last_used_at);

INSERT INTO products (name, last_used_at, created_at)
SELECT
  trim(metadata->>'product') AS name,
  max(occurred_at) AS last_used_at,
  min(created_at) AS created_at
FROM events
WHERE metadata ? 'product'
  AND trim(metadata->>'product') <> ''
GROUP BY trim(metadata->>'product')
ON CONFLICT (name) DO UPDATE
  SET last_used_at = GREATEST(products.last_used_at, EXCLUDED.last_used_at);

INSERT INTO products (name, last_used_at, created_at)
SELECT
  trim(metadata->>'product') AS name,
  max(occurred_at) AS last_used_at,
  min(created_at) AS created_at
FROM events
WHERE metadata ? 'product'
  AND trim(metadata->>'product') <> ''
GROUP BY trim(metadata->>'product')
ON CONFLICT (name) DO UPDATE
  SET last_used_at = GREATEST(products.last_used_at, EXCLUDED.last_used_at);

INSERT INTO products (name, last_used_at, created_at)
SELECT
  trim(metadata->>'product') AS name,
  max(occurred_at) AS last_used_at,
  min(created_at) AS created_at
FROM events
WHERE metadata ? 'product'
  AND trim(metadata->>'product') <> ''
GROUP BY trim(metadata->>'product')
ON CONFLICT (name) DO UPDATE
  SET last_used_at = GREATEST(products.last_used_at, EXCLUDED.last_used_at);
