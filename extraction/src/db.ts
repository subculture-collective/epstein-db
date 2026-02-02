import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
});

// Helper for transactions
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Document operations
export async function insertDocument(doc: {
  docId: string;
  datasetId: number;
  filePath?: string;
  fullText?: string;
  pageCount?: number;
}): Promise<number> {
  const result = await pool.query(
    `INSERT INTO documents (doc_id, dataset_id, file_path, full_text, page_count)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (doc_id) DO UPDATE SET
       full_text = COALESCE(EXCLUDED.full_text, documents.full_text),
       updated_at = NOW()
     RETURNING id`,
    [doc.docId, doc.datasetId, doc.filePath, doc.fullText, doc.pageCount]
  );
  return result.rows[0].id;
}

export async function updateDocumentAnalysis(
  docId: string,
  analysis: {
    summary: string;
    detailedSummary: string;
    documentType: string;
    dateEarliest?: Date;
    dateLatest?: Date;
    contentTags: string[];
  }
): Promise<void> {
  await pool.query(
    `UPDATE documents SET
       summary = $2,
       detailed_summary = $3,
       document_type = $4,
       date_earliest = $5,
       date_latest = $6,
       content_tags = $7,
       analysis_status = 'complete',
       analyzed_at = NOW(),
       updated_at = NOW()
     WHERE doc_id = $1`,
    [
      docId,
      analysis.summary,
      analysis.detailedSummary,
      analysis.documentType,
      analysis.dateEarliest,
      analysis.dateLatest,
      JSON.stringify(analysis.contentTags),
    ]
  );
}

export async function getDocumentsPendingAnalysis(
  limit: number = 100
): Promise<Array<{ id: number; docId: string; fullText: string }>> {
  const result = await pool.query(
    `SELECT id, doc_id, full_text FROM documents
     WHERE analysis_status = 'pending' AND full_text IS NOT NULL
     LIMIT $1`,
    [limit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    docId: row.doc_id,
    fullText: row.full_text,
  }));
}

// Entity operations
export async function upsertEntity(entity: {
  canonicalName: string;
  entityType: string;
  aliases?: string[];
  description?: string;
}): Promise<number> {
  const result = await pool.query(
    `INSERT INTO entities (canonical_name, entity_type, aliases, description)
     VALUES ($1, $2::entity_type, $3, $4)
     ON CONFLICT (canonical_name, entity_type) DO UPDATE SET
       aliases = COALESCE(
         entities.aliases || EXCLUDED.aliases,
         entities.aliases,
         EXCLUDED.aliases
       ),
       updated_at = NOW()
     RETURNING id`,
    [
      entity.canonicalName,
      entity.entityType,
      JSON.stringify(entity.aliases || []),
      entity.description,
    ]
  );
  return result.rows[0].id;
}

export async function linkEntityToDocument(
  entityId: number,
  documentId: number,
  mentionCount: number = 1,
  contextSnippet?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO document_entities (document_id, entity_id, mention_count, context_snippet)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (document_id, entity_id) DO UPDATE SET
       mention_count = document_entities.mention_count + EXCLUDED.mention_count`,
    [documentId, entityId, mentionCount, contextSnippet]
  );
}

export async function insertTriple(triple: {
  documentId: number;
  subjectId: number;
  predicate: string;
  objectId: number;
  locationId?: number;
  timestamp?: Date;
  explicitTopic?: string;
  implicitTopic?: string;
  tags?: string[];
  sequenceOrder: number;
}): Promise<number> {
  const result = await pool.query(
    `INSERT INTO triples 
     (document_id, subject_id, predicate, object_id, location_id, timestamp, explicit_topic, implicit_topic, tags, sequence_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      triple.documentId,
      triple.subjectId,
      triple.predicate,
      triple.objectId,
      triple.locationId,
      triple.timestamp,
      triple.explicitTopic,
      triple.implicitTopic,
      JSON.stringify(triple.tags || []),
      triple.sequenceOrder,
    ]
  );
  return result.rows[0].id;
}

// Layer calculation
export async function calculateEntityLayers(): Promise<void> {
  // Set Layer 1: entities that share documents with Epstein
  await pool.query(`
    WITH epstein AS (
      SELECT id FROM entities WHERE canonical_name = 'Jeffrey Epstein' AND entity_type = 'person'
    ),
    epstein_docs AS (
      SELECT DISTINCT document_id FROM document_entities WHERE entity_id = (SELECT id FROM epstein)
    ),
    layer1_entities AS (
      SELECT DISTINCT entity_id FROM document_entities
      WHERE document_id IN (SELECT document_id FROM epstein_docs)
      AND entity_id != (SELECT id FROM epstein)
    )
    UPDATE entities SET layer = 1, updated_at = NOW()
    WHERE id IN (SELECT entity_id FROM layer1_entities) AND layer IS NULL
  `);

  // Set Layer 2: entities that share documents with Layer 1 (but not with Epstein directly)
  await pool.query(`
    WITH layer1 AS (
      SELECT id FROM entities WHERE layer = 1
    ),
    layer1_docs AS (
      SELECT DISTINCT document_id FROM document_entities WHERE entity_id IN (SELECT id FROM layer1)
    ),
    layer2_candidates AS (
      SELECT DISTINCT entity_id FROM document_entities
      WHERE document_id IN (SELECT document_id FROM layer1_docs)
    )
    UPDATE entities SET layer = 2, updated_at = NOW()
    WHERE id IN (SELECT entity_id FROM layer2_candidates) AND layer IS NULL
  `);

  // Set Layer 3: remaining entities
  await pool.query(`
    UPDATE entities SET layer = 3, updated_at = NOW() WHERE layer IS NULL
  `);
}

// Search
export async function searchEntities(
  query: string,
  limit: number = 20
): Promise<
  Array<{
    id: number;
    canonicalName: string;
    entityType: string;
    layer: number;
    documentCount: number;
  }>
> {
  const result = await pool.query(
    `SELECT id, canonical_name, entity_type, layer, document_count
     FROM entities
     WHERE canonical_name ILIKE $1 OR canonical_name % $2
     ORDER BY similarity(canonical_name, $2) DESC, document_count DESC
     LIMIT $3`,
    [`%${query}%`, query, limit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    canonicalName: row.canonical_name,
    entityType: row.entity_type,
    layer: row.layer,
    documentCount: row.document_count,
  }));
}

export async function close(): Promise<void> {
  await pool.end();
}
