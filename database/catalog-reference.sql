-- PCMaker catalog reference design — NOT AN APPLIED MIGRATION.
--
-- Firebase Data Connect currently owns the project schema. This PostgreSQL
-- reference uses the existing logical names `components` and
-- `component_specifications`, but deliberately moves prices to offers. Before
-- applying anything, the database owner must reconcile this with the current
-- GraphQL schema where Component.price is required Float.
--
-- API/import IDs such as `userbenchmark-cpu-<sha256>` are business identifiers,
-- not UUID primary keys. Store CatalogComponent.id in components.public_id.
-- sourceIdentity.externalId contains the original MPN (or URL fallback), and
-- sourceIdentity.externalType preserves the provider's type (e.g. CPU/SSD/HDD).
-- A real migration must generate UUIDs; never cast public IDs to UUID.

CREATE TABLE components (
  id UUID PRIMARY KEY,
  public_id VARCHAR(255) NOT NULL UNIQUE,
  component_type VARCHAR(32) NOT NULL CHECK (component_type IN (
    'cpu', 'gpu', 'motherboard', 'memory', 'storage', 'psu', 'case', 'cooling'
  )),
  name VARCHAR(200) NOT NULL,
  manufacturer VARCHAR(100) NOT NULL,
  model VARCHAR(150) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  performance_score NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Marketing names are not unique identities: variants may share a name.

CREATE INDEX components_type_name_idx ON components (component_type, name);
CREATE INDEX components_manufacturer_idx ON components (manufacturer);

CREATE TABLE component_specifications (
  id UUID PRIMARY KEY,
  component_id UUID NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  specification_name VARCHAR(100) NOT NULL,
  specification_value VARCHAR(255) NOT NULL,
  UNIQUE (component_id, specification_name)
);

CREATE TABLE component_sources (
  id UUID PRIMARY KEY,
  provider VARCHAR(80) NOT NULL,
  source_label VARCHAR(160) NOT NULL,
  source_url TEXT,
  captured_at TIMESTAMPTZ NOT NULL,
  UNIQUE (provider, source_label)
);

-- A product may have multiple MPNs/provider identities. The same external
-- type+ID must not create another product when a source changes its label.
CREATE TABLE component_external_ids (
  component_id UUID NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES component_sources(id) ON DELETE CASCADE,
  external_type VARCHAR(32) NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  canonical_url TEXT,
  PRIMARY KEY (source_id, external_type, external_id)
);

-- Source-specific observations, never treated as universal FPS/performance.
CREATE TABLE component_benchmark_observations (
  id UUID PRIMARY KEY,
  component_id UUID NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES component_sources(id) ON DELETE RESTRICT,
  metric_name VARCHAR(80) NOT NULL,
  source_rank INTEGER CHECK (source_rank > 0),
  metric_value NUMERIC NOT NULL,
  sample_count INTEGER CHECK (sample_count >= 0),
  captured_at TIMESTAMPTZ NOT NULL,
  UNIQUE (component_id, source_id, metric_name, captured_at)
);

CREATE TABLE component_offers (
  id UUID PRIMARY KEY,
  component_id UUID NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES component_sources(id) ON DELETE RESTRICT,
  external_id VARCHAR(255) NOT NULL,
  shop_name VARCHAR(160) NOT NULL,
  product_url TEXT NOT NULL,
  currency CHAR(3) NOT NULL CHECK (currency = 'PLN'),
  current_price_cents INTEGER CHECK (current_price_cents >= 0),
  shipping_price_cents INTEGER CHECK (shipping_price_cents >= 0),
  availability VARCHAR(32) NOT NULL DEFAULT 'unknown' CHECK (
    availability IN ('unknown', 'in_stock', 'out_of_stock', 'preorder')
  ),
  last_seen_at TIMESTAMPTZ NOT NULL,
  UNIQUE (source_id, external_id)
);

CREATE TABLE component_price_snapshots (
  id UUID PRIMARY KEY,
  offer_id UUID NOT NULL REFERENCES component_offers(id) ON DELETE CASCADE,
  price_cents INTEGER CHECK (price_cents >= 0),
  shipping_price_cents INTEGER CHECK (shipping_price_cents >= 0),
  currency CHAR(3) NOT NULL CHECK (currency = 'PLN'),
  captured_at TIMESTAMPTZ NOT NULL,
  UNIQUE (offer_id, captured_at)
);

-- `current_price_cents` may be NULL when a source reports stock without a
-- usable price. Missing data must not be rendered as 0 PLN.
