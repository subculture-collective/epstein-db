/**
 * Pattern Finder Agent
 * 
 * Discovers non-obvious connections and patterns in the Epstein Files database.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import pg from 'pg';

const { Pool } = pg;

// ============================================================================
// Configuration
// ============================================================================

const config = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://epstein:epstein_dev@localhost:5432/epstein',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  LLM_MODEL: process.env.LLM_MODEL || 'claude-sonnet-4-20250514',
};

const pool = new Pool({ connectionString: config.DATABASE_URL });
const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

// ============================================================================
// Types
// ============================================================================

interface Entity {
  id: number;
  canonicalName: string;
  entityType: string;
  layer: number;
  documentCount: number;
  connectionCount: number;
  pppMatches: any[];
  fecMatches: any[];
  grantsMatches: any[];
}

interface Connection {
  entity1: string;
  entity2: string;
  sharedDocs: number;
  documentIds: string[];
}

interface PatternHypothesis {
  title: string;
  description: string;
  patternType: string;
  entityNames: string[];
  evidence: string[];
  confidence: number;
}

// ============================================================================
// Sampling Functions
// ============================================================================

async function getHighDegreeEntities(limit: number = 50): Promise<Entity[]> {
  const result = await pool.query(`
    SELECT 
      id, canonical_name, entity_type, layer, 
      document_count, connection_count,
      ppp_matches, fec_matches, grants_matches
    FROM entities
    WHERE entity_type IN ('person', 'organization')
    ORDER BY connection_count DESC
    LIMIT $1
  `, [limit]);
  
  return result.rows.map(row => ({
    id: row.id,
    canonicalName: row.canonical_name,
    entityType: row.entity_type,
    layer: row.layer || 0,
    documentCount: row.document_count || 0,
    connectionCount: row.connection_count || 0,
    pppMatches: row.ppp_matches || [],
    fecMatches: row.fec_matches || [],
    grantsMatches: row.grants_matches || [],
  }));
}

async function getEntityConnections(entityId: number, limit: number = 100): Promise<Connection[]> {
  const result = await pool.query(`
    SELECT 
      e1.canonical_name AS entity1,
      e2.canonical_name AS entity2,
      COUNT(DISTINCT d.id) AS shared_docs,
      array_agg(DISTINCT d.doc_id) AS document_ids
    FROM document_entities de1
    JOIN document_entities de2 ON de1.document_id = de2.document_id AND de1.entity_id != de2.entity_id
    JOIN entities e1 ON de1.entity_id = e1.id
    JOIN entities e2 ON de2.entity_id = e2.id
    JOIN documents d ON de1.document_id = d.id
    WHERE de1.entity_id = $1
    GROUP BY e1.canonical_name, e2.canonical_name
    ORDER BY shared_docs DESC
    LIMIT $2
  `, [entityId, limit]);
  
  return result.rows.map(row => ({
    entity1: row.entity1,
    entity2: row.entity2,
    sharedDocs: parseInt(row.shared_docs),
    documentIds: row.document_ids,
  }));
}

async function getEntitiesWithCrossRefMatches(): Promise<Entity[]> {
  const result = await pool.query(`
    SELECT 
      id, canonical_name, entity_type, layer,
      document_count, connection_count,
      ppp_matches, fec_matches, grants_matches
    FROM entities
    WHERE 
      (ppp_matches IS NOT NULL AND jsonb_array_length(ppp_matches) > 0)
      OR (fec_matches IS NOT NULL AND jsonb_array_length(fec_matches) > 0)
      OR (grants_matches IS NOT NULL AND jsonb_array_length(grants_matches) > 0)
    ORDER BY connection_count DESC
    LIMIT 100
  `);
  
  return result.rows.map(row => ({
    id: row.id,
    canonicalName: row.canonical_name,
    entityType: row.entity_type,
    layer: row.layer || 0,
    documentCount: row.document_count || 0,
    connectionCount: row.connection_count || 0,
    pppMatches: row.ppp_matches || [],
    fecMatches: row.fec_matches || [],
    grantsMatches: row.grants_matches || [],
  }));
}

// ============================================================================
// Pattern Detection
// ============================================================================

const PATTERN_SYSTEM_PROMPT = `You are an investigative analyst specializing in network analysis and pattern detection. You're analyzing data from the Jeffrey Epstein case documents.

Your task is to identify non-obvious patterns, connections, and anomalies that might warrant further investigation.

Focus on:
1. Financial patterns (money flows, unusual transactions, timing)
2. Organizational patterns (shared board memberships, foundations, legal representation)
3. Temporal patterns (activities clustering around dates, gaps in documentation)
4. Network anomalies (unusually dense connections, unexpected bridges between groups)
5. Cross-reference insights (what PPP loans, FEC contributions, or federal grants reveal)

Be specific and cite evidence. Generate hypotheses that can be validated with document review.

IMPORTANT: You are surfacing patterns for investigation, not asserting guilt or wrongdoing.`;

async function generatePatternHypotheses(
  entities: Entity[],
  connections: Connection[]
): Promise<PatternHypothesis[]> {
  const entitySummaries = entities.map(e => ({
    name: e.canonicalName,
    type: e.entityType,
    layer: e.layer,
    docs: e.documentCount,
    connections: e.connectionCount,
    hasPPP: e.pppMatches.length > 0,
    hasFEC: e.fecMatches.length > 0,
    hasGrants: e.grantsMatches.length > 0,
  }));

  const connectionSummaries = connections.slice(0, 50).map(c => ({
    pair: `${c.entity1} ↔ ${c.entity2}`,
    sharedDocs: c.sharedDocs,
  }));

  const prompt = `Analyze this network data and identify potential patterns worth investigating.

ENTITIES (${entities.length} total, showing key attributes):
${JSON.stringify(entitySummaries, null, 2)}

TOP CONNECTIONS:
${JSON.stringify(connectionSummaries, null, 2)}

Generate 3-5 pattern hypotheses. For each, provide:
1. A specific, descriptive title
2. What the pattern suggests
3. Which entities are involved
4. What evidence supports this hypothesis
5. Confidence level (0-1)

Return JSON array:
[
  {
    "title": "Pattern Title",
    "description": "What this pattern suggests and why it's notable",
    "patternType": "financial|organizational|temporal|network|crossref",
    "entityNames": ["Entity1", "Entity2"],
    "evidence": ["Evidence point 1", "Evidence point 2"],
    "confidence": 0.7
  }
]

Return ONLY valid JSON.`;

  const response = await anthropic.messages.create({
    model: config.LLM_MODEL,
    max_tokens: 4096,
    system: PATTERN_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  const jsonMatch = content.text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('No JSON found:', content.text);
    return [];
  }

  return JSON.parse(jsonMatch[0]);
}

// ============================================================================
// Save Patterns
// ============================================================================

async function savePattern(pattern: PatternHypothesis): Promise<number> {
  // Get entity IDs
  const entityResult = await pool.query(`
    SELECT id FROM entities WHERE canonical_name = ANY($1)
  `, [pattern.entityNames]);
  
  const entityIds = entityResult.rows.map(r => r.id);

  const result = await pool.query(`
    INSERT INTO pattern_findings 
      (title, description, pattern_type, entity_ids, evidence, confidence, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'hypothesis')
    RETURNING id
  `, [
    pattern.title,
    pattern.description,
    pattern.patternType,
    entityIds,
    JSON.stringify({
      entityNames: pattern.entityNames,
      evidencePoints: pattern.evidence,
    }),
    pattern.confidence,
  ]);

  return result.rows[0].id;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🔎 Pattern Finder Agent starting...\n');

  // Get high-degree entities
  console.log('📊 Sampling high-degree entities...');
  const highDegree = await getHighDegreeEntities(50);
  console.log(`   Found ${highDegree.length} high-degree entities`);

  // Get entities with cross-reference matches
  console.log('📊 Sampling entities with cross-reference matches...');
  const crossRef = await getEntitiesWithCrossRefMatches();
  console.log(`   Found ${crossRef.length} entities with PPP/FEC/Grants matches`);

  // Get connections for top entities
  console.log('📊 Sampling connections...');
  const allConnections: Connection[] = [];
  for (const entity of highDegree.slice(0, 10)) {
    const connections = await getEntityConnections(entity.id, 50);
    allConnections.push(...connections);
  }
  console.log(`   Found ${allConnections.length} connections`);

  // Combine entities (deduplicate)
  const allEntities = [...highDegree, ...crossRef];
  const uniqueEntities = Array.from(
    new Map(allEntities.map(e => [e.id, e])).values()
  );

  // Generate pattern hypotheses
  console.log('\n🧠 Generating pattern hypotheses...');
  const patterns = await generatePatternHypotheses(uniqueEntities, allConnections);
  console.log(`   Generated ${patterns.length} hypotheses`);

  // Save patterns
  console.log('\n💾 Saving patterns to database...');
  for (const pattern of patterns) {
    const id = await savePattern(pattern);
    console.log(`   ✓ Saved: ${pattern.title} (ID: ${id})`);
  }

  console.log('\n✅ Pattern Finder complete!');
  console.log(`   Patterns discovered: ${patterns.length}`);

  await pool.end();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
