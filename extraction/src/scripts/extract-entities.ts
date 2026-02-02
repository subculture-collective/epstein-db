/**
 * Entity Extraction Script
 * 
 * Processes documents through the LLM to extract entities and relationships.
 * Uses rate limiting and batching for efficiency.
 */

import pLimit from 'p-limit';
import { config } from '../config.js';
import {
  getDocumentsPendingAnalysis,
  updateDocumentAnalysis,
  upsertEntity,
  linkEntityToDocument,
  insertTriple,
  pool,
  close,
} from '../db.js';
import { extractFromDocument, type Entity, type Triple } from '../ner/extractor.js';

// Rate limiter
const limit = pLimit(config.MAX_WORKERS);

// Track progress
let processed = 0;
let errors = 0;
let totalEntities = 0;
let totalTriples = 0;

async function processDocument(doc: {
  id: number;
  docId: string;
  fullText: string;
}): Promise<void> {
  try {
    console.log(`  📝 Processing ${doc.docId}...`);

    // Mark as processing
    await pool.query(
      `UPDATE documents SET analysis_status = 'processing' WHERE id = $1`,
      [doc.id]
    );

    // Extract entities and relationships
    const analysis = await extractFromDocument(doc.docId, doc.fullText);

    // Parse dates
    const dateEarliest = analysis.dateEarliest
      ? new Date(analysis.dateEarliest)
      : undefined;
    const dateLatest = analysis.dateLatest
      ? new Date(analysis.dateLatest)
      : undefined;

    // Update document analysis
    await updateDocumentAnalysis(doc.docId, {
      summary: analysis.summary,
      detailedSummary: analysis.detailedSummary,
      documentType: analysis.documentType,
      dateEarliest,
      dateLatest,
      contentTags: analysis.contentTags,
    });

    // Insert entities and get their IDs
    const entityIdMap = new Map<string, number>();
    
    for (const entity of analysis.entities) {
      const entityId = await upsertEntity({
        canonicalName: entity.name,
        entityType: entity.type,
      });
      entityIdMap.set(entity.name.toLowerCase(), entityId);

      // Link entity to document
      await linkEntityToDocument(entityId, doc.id, 1, entity.context);
    }

    totalEntities += analysis.entities.length;

    // Insert triples
    for (let i = 0; i < analysis.triples.length; i++) {
      const triple = analysis.triples[i];
      
      // Get or create subject entity
      let subjectId = entityIdMap.get(triple.subject.toLowerCase());
      if (!subjectId) {
        subjectId = await upsertEntity({
          canonicalName: triple.subject,
          entityType: triple.subjectType,
        });
        entityIdMap.set(triple.subject.toLowerCase(), subjectId);
      }

      // Get or create object entity
      let objectId = entityIdMap.get(triple.object.toLowerCase());
      if (!objectId) {
        objectId = await upsertEntity({
          canonicalName: triple.object,
          entityType: triple.objectType,
        });
        entityIdMap.set(triple.object.toLowerCase(), objectId);
      }

      // Get location entity if present
      let locationId: number | undefined;
      if (triple.location) {
        locationId = entityIdMap.get(triple.location.toLowerCase());
        if (!locationId) {
          locationId = await upsertEntity({
            canonicalName: triple.location,
            entityType: 'location',
          });
          entityIdMap.set(triple.location.toLowerCase(), locationId);
        }
      }

      // Parse timestamp
      const timestamp = triple.timestamp ? new Date(triple.timestamp) : undefined;

      // Insert triple
      await insertTriple({
        documentId: doc.id,
        subjectId,
        predicate: triple.predicate,
        objectId,
        locationId,
        timestamp,
        explicitTopic: triple.explicitTopic,
        implicitTopic: triple.implicitTopic,
        tags: triple.tags,
        sequenceOrder: i,
      });
    }

    totalTriples += analysis.triples.length;
    processed++;

    console.log(
      `  ✓ ${doc.docId}: ${analysis.entities.length} entities, ${analysis.triples.length} triples`
    );
  } catch (error) {
    errors++;
    console.error(`  ❌ ${doc.docId}: ${error}`);
    
    // Mark as failed
    await pool.query(
      `UPDATE documents SET 
         analysis_status = 'failed',
         error_message = $2,
         updated_at = NOW()
       WHERE id = $1`,
      [doc.id, String(error)]
    );
  }
}

async function main() {
  console.log('🔍 Starting entity extraction...');
  console.log(`   Model: ${config.LLM_MODEL}`);
  console.log(`   Workers: ${config.MAX_WORKERS}`);
  console.log(`   Batch size: ${config.BATCH_SIZE}\n`);

  let hasMore = true;

  while (hasMore) {
    // Get batch of pending documents
    const documents = await getDocumentsPendingAnalysis(config.BATCH_SIZE);
    
    if (documents.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`\n📦 Processing batch of ${documents.length} documents...`);

    // Process in parallel with rate limiting
    await Promise.all(
      documents.map((doc) => limit(() => processDocument(doc)))
    );

    // Brief pause between batches
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`\n✅ Entity extraction complete!`);
  console.log(`   Documents processed: ${processed}`);
  console.log(`   Entities extracted: ${totalEntities}`);
  console.log(`   Triples extracted: ${totalTriples}`);
  console.log(`   Errors: ${errors}`);

  await close();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
