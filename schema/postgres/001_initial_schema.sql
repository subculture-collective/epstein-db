-- Epstein Files Database Schema
-- PostgreSQL 16+

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- Fuzzy text matching
CREATE EXTENSION IF NOT EXISTS btree_gin;    -- GIN indexes for JSONB
CREATE EXTENSION IF NOT EXISTS unaccent;     -- Accent-insensitive search

-- ============================================================================
-- DOCUMENTS
-- ============================================================================

CREATE TABLE documents (
    id              SERIAL PRIMARY KEY,
    doc_id          TEXT UNIQUE NOT NULL,           -- EFTA00000001
    dataset_id      INTEGER NOT NULL,               -- Which dataset (1-5)
    file_path       TEXT,                           -- Original file path
    
    -- Content
    full_text       TEXT,                           -- OCR text
    page_count      INTEGER,
    
    -- AI Analysis
    summary         TEXT,                           -- One sentence summary
    detailed_summary TEXT,                          -- Paragraph summary
    document_type   TEXT,                           -- Deposition, email, financial record, etc.
    
    -- Temporal
    date_earliest   DATE,                           -- Earliest date mentioned
    date_latest     DATE,                           -- Latest date mentioned
    
    -- Metadata
    content_tags    JSONB DEFAULT '[]',             -- AI-extracted tags
    analysis_status TEXT DEFAULT 'pending',         -- pending, processing, complete, failed
    error_message   TEXT,
    
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    analyzed_at     TIMESTAMPTZ
);

CREATE INDEX idx_documents_doc_id ON documents(doc_id);
CREATE INDEX idx_documents_dataset ON documents(dataset_id);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_status ON documents(analysis_status);
CREATE INDEX idx_documents_dates ON documents(date_earliest, date_latest);
CREATE INDEX idx_documents_fulltext ON documents USING gin(to_tsvector('english', full_text));
CREATE INDEX idx_documents_tags ON documents USING gin(content_tags);

-- ============================================================================
-- ENTITIES
-- ============================================================================

-- Entity types enum
CREATE TYPE entity_type AS ENUM (
    'person',
    'organization',
    'location',
    'date',
    'reference',      -- Document references, case numbers, etc.
    'financial',      -- Dollar amounts, account numbers
    'unknown'
);

CREATE TABLE entities (
    id              SERIAL PRIMARY KEY,
    canonical_name  TEXT NOT NULL,                  -- Deduplicated canonical form
    entity_type     entity_type NOT NULL,
    
    -- Classification
    layer           INTEGER,                        -- 0=Epstein, 1=direct, 2=one removed, 3=two removed
    
    -- Metadata
    aliases         JSONB DEFAULT '[]',             -- Alternative spellings/names
    attributes      JSONB DEFAULT '{}',             -- Type-specific attributes
    description     TEXT,                           -- AI-generated description
    
    -- Cross-reference matches
    ppp_matches     JSONB DEFAULT '[]',             -- Matched PPP loan records
    fec_matches     JSONB DEFAULT '[]',             -- Matched FEC contributions
    grants_matches  JSONB DEFAULT '[]',             -- Matched federal grants
    
    -- Stats
    document_count  INTEGER DEFAULT 0,              -- Number of documents mentioning entity
    connection_count INTEGER DEFAULT 0,             -- Number of connections to other entities
    
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(canonical_name, entity_type)
);

CREATE INDEX idx_entities_name ON entities(canonical_name);
CREATE INDEX idx_entities_name_trgm ON entities USING gin(canonical_name gin_trgm_ops);
CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_layer ON entities(layer);
CREATE INDEX idx_entities_aliases ON entities USING gin(aliases);

-- ============================================================================
-- ENTITY ALIASES
-- ============================================================================

CREATE TABLE entity_aliases (
    id              SERIAL PRIMARY KEY,
    original_name   TEXT NOT NULL,
    entity_id       INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    confidence      REAL DEFAULT 1.0,               -- Confidence of alias match
    source          TEXT DEFAULT 'extraction',      -- extraction, llm_dedup, manual
    reasoning       TEXT,                           -- Why this was matched
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_aliases_original ON entity_aliases(original_name);
CREATE INDEX idx_aliases_original_trgm ON entity_aliases USING gin(original_name gin_trgm_ops);
CREATE INDEX idx_aliases_entity ON entity_aliases(entity_id);

-- ============================================================================
-- DOCUMENT-ENTITY RELATIONSHIPS
-- ============================================================================

CREATE TABLE document_entities (
    id              SERIAL PRIMARY KEY,
    document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    entity_id       INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    
    -- Context
    mention_count   INTEGER DEFAULT 1,              -- How many times mentioned
    first_mention   INTEGER,                        -- Character offset of first mention
    context_snippet TEXT,                           -- Surrounding text
    
    -- Metadata
    extraction_confidence REAL DEFAULT 1.0,
    
    UNIQUE(document_id, entity_id)
);

CREATE INDEX idx_doc_entities_doc ON document_entities(document_id);
CREATE INDEX idx_doc_entities_entity ON document_entities(entity_id);

-- ============================================================================
-- RDF TRIPLES (Relationships)
-- ============================================================================

CREATE TABLE triples (
    id              SERIAL PRIMARY KEY,
    document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    
    -- Subject-Predicate-Object
    subject_id      INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    predicate       TEXT NOT NULL,                  -- Action/verb
    object_id       INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    
    -- Context
    location_id     INTEGER REFERENCES entities(id) ON DELETE SET NULL,
    timestamp       DATE,
    
    -- Metadata
    explicit_topic  TEXT,                           -- Stated subject matter
    implicit_topic  TEXT,                           -- Inferred subject matter
    tags            JSONB DEFAULT '[]',
    confidence      REAL DEFAULT 1.0,
    sequence_order  INTEGER,                        -- Order within document
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_triples_document ON triples(document_id);
CREATE INDEX idx_triples_subject ON triples(subject_id);
CREATE INDEX idx_triples_object ON triples(object_id);
CREATE INDEX idx_triples_predicate ON triples(predicate);
CREATE INDEX idx_triples_timestamp ON triples(timestamp);
CREATE INDEX idx_triples_tags ON triples USING gin(tags);

-- ============================================================================
-- CROSS-REFERENCE TABLES
-- ============================================================================

-- PPP Loans
CREATE TABLE ppp_loans (
    id              SERIAL PRIMARY KEY,
    loan_number     TEXT UNIQUE,
    borrower_name   TEXT NOT NULL,
    borrower_address TEXT,
    borrower_city   TEXT,
    borrower_state  TEXT,
    borrower_zip    TEXT,
    loan_amount     NUMERIC(15,2),
    loan_status     TEXT,
    forgiveness_amount NUMERIC(15,2),
    lender          TEXT,
    naics_code      TEXT,
    business_type   TEXT,
    jobs_retained   INTEGER,
    date_approved   DATE,
    
    -- Matching metadata
    normalized_name TEXT,                           -- For fuzzy matching
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ppp_name ON ppp_loans(borrower_name);
CREATE INDEX idx_ppp_name_trgm ON ppp_loans USING gin(borrower_name gin_trgm_ops);
CREATE INDEX idx_ppp_normalized ON ppp_loans USING gin(normalized_name gin_trgm_ops);

-- FEC Contributions
CREATE TABLE fec_contributions (
    id              SERIAL PRIMARY KEY,
    fec_id          TEXT,
    contributor_name TEXT NOT NULL,
    contributor_city TEXT,
    contributor_state TEXT,
    contributor_zip TEXT,
    contributor_employer TEXT,
    contributor_occupation TEXT,
    committee_id    TEXT,
    committee_name  TEXT,
    candidate_id    TEXT,
    candidate_name  TEXT,
    amount          NUMERIC(12,2),
    contribution_date DATE,
    contribution_type TEXT,
    
    -- Matching metadata
    normalized_name TEXT,
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fec_contributor ON fec_contributions(contributor_name);
CREATE INDEX idx_fec_contributor_trgm ON fec_contributions USING gin(contributor_name gin_trgm_ops);
CREATE INDEX idx_fec_normalized ON fec_contributions USING gin(normalized_name gin_trgm_ops);
CREATE INDEX idx_fec_candidate ON fec_contributions(candidate_name);
CREATE INDEX idx_fec_committee ON fec_contributions(committee_name);

-- Federal Grants
CREATE TABLE federal_grants (
    id              SERIAL PRIMARY KEY,
    award_id        TEXT,
    recipient_name  TEXT NOT NULL,
    recipient_city  TEXT,
    recipient_state TEXT,
    recipient_zip   TEXT,
    awarding_agency TEXT,
    funding_agency  TEXT,
    award_amount    NUMERIC(15,2),
    award_date      DATE,
    description     TEXT,
    cfda_number     TEXT,
    cfda_title      TEXT,
    
    -- Matching metadata
    normalized_name TEXT,
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_grants_recipient ON federal_grants(recipient_name);
CREATE INDEX idx_grants_recipient_trgm ON federal_grants USING gin(recipient_name gin_trgm_ops);
CREATE INDEX idx_grants_normalized ON federal_grants USING gin(normalized_name gin_trgm_ops);

-- ============================================================================
-- ENTITY CROSS-REFERENCE MATCHES
-- ============================================================================

CREATE TYPE match_source AS ENUM ('ppp', 'fec', 'grants');

CREATE TABLE entity_crossref_matches (
    id              SERIAL PRIMARY KEY,
    entity_id       INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    source          match_source NOT NULL,
    source_id       INTEGER NOT NULL,               -- ID in the source table
    
    -- Match quality
    match_score     REAL NOT NULL,                  -- 0-1 similarity score
    match_method    TEXT,                           -- exact, fuzzy, soundex, etc.
    verified        BOOLEAN DEFAULT FALSE,          -- Human-verified match
    false_positive  BOOLEAN DEFAULT FALSE,          -- Confirmed not a match
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    verified_at     TIMESTAMPTZ,
    verified_by     TEXT
);

CREATE INDEX idx_crossref_entity ON entity_crossref_matches(entity_id);
CREATE INDEX idx_crossref_source ON entity_crossref_matches(source, source_id);

-- ============================================================================
-- PATTERN FINDINGS
-- ============================================================================

CREATE TABLE pattern_findings (
    id              SERIAL PRIMARY KEY,
    
    -- The pattern
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    pattern_type    TEXT,                           -- financial_flow, travel_pattern, organizational_link, etc.
    
    -- Involved entities
    entity_ids      INTEGER[] NOT NULL,
    
    -- Evidence
    evidence        JSONB NOT NULL,                 -- Supporting documents, connections, etc.
    confidence      REAL,
    
    -- Status
    status          TEXT DEFAULT 'hypothesis',      -- hypothesis, validated, rejected
    notes           TEXT,
    
    -- Timestamps
    discovered_at   TIMESTAMPTZ DEFAULT NOW(),
    discovered_by   TEXT DEFAULT 'pattern_agent',
    validated_at    TIMESTAMPTZ,
    validated_by    TEXT
);

CREATE INDEX idx_patterns_type ON pattern_findings(pattern_type);
CREATE INDEX idx_patterns_status ON pattern_findings(status);
CREATE INDEX idx_patterns_entities ON pattern_findings USING gin(entity_ids);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Entity connections view
CREATE VIEW entity_connections AS
SELECT 
    e1.id AS entity1_id,
    e1.canonical_name AS entity1_name,
    e1.entity_type AS entity1_type,
    e2.id AS entity2_id,
    e2.canonical_name AS entity2_name,
    e2.entity_type AS entity2_type,
    COUNT(DISTINCT d.id) AS shared_documents,
    array_agg(DISTINCT d.doc_id) AS document_ids
FROM document_entities de1
JOIN document_entities de2 ON de1.document_id = de2.document_id AND de1.entity_id < de2.entity_id
JOIN entities e1 ON de1.entity_id = e1.id
JOIN entities e2 ON de2.entity_id = e2.id
JOIN documents d ON de1.document_id = d.id
GROUP BY e1.id, e1.canonical_name, e1.entity_type, e2.id, e2.canonical_name, e2.entity_type;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Normalize name for fuzzy matching
CREATE OR REPLACE FUNCTION normalize_name(name TEXT) RETURNS TEXT AS $$
BEGIN
    RETURN lower(
        regexp_replace(
            regexp_replace(
                unaccent(name),
                '[^a-zA-Z0-9 ]', '', 'g'
            ),
            '\s+', ' ', 'g'
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update entity stats
CREATE OR REPLACE FUNCTION update_entity_stats() RETURNS TRIGGER AS $$
BEGIN
    -- Update document count
    UPDATE entities e
    SET document_count = (
        SELECT COUNT(DISTINCT document_id) 
        FROM document_entities 
        WHERE entity_id = e.id
    ),
    connection_count = (
        SELECT COUNT(*) 
        FROM entity_connections 
        WHERE entity1_id = e.id OR entity2_id = e.id
    ),
    updated_at = NOW()
    WHERE e.id = COALESCE(NEW.entity_id, OLD.entity_id);
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_entity_stats
AFTER INSERT OR UPDATE OR DELETE ON document_entities
FOR EACH ROW EXECUTE FUNCTION update_entity_stats();

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert Jeffrey Epstein as Layer 0
INSERT INTO entities (canonical_name, entity_type, layer, description, aliases)
VALUES (
    'Jeffrey Epstein',
    'person',
    0,
    'American financier and convicted sex offender',
    '["Jeffrey E. Epstein", "J. Epstein", "Epstein", "JE"]'::jsonb
) ON CONFLICT DO NOTHING;
