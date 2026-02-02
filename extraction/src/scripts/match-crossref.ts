/**
 * Cross-Reference Matching Script
 * 
 * Matches extracted entities against PPP loans, FEC contributions, and federal grants.
 * Uses fuzzy matching with configurable thresholds.
 */

import { pool, close } from '../db.js';

// Similarity threshold for matches (0-1)
const MATCH_THRESHOLD = 0.7;

interface Match {
  entityId: number;
  entityName: string;
  source: 'ppp' | 'fec' | 'grants';
  sourceId: number;
  sourceName: string;
  score: number;
}

async function findPPPMatches(): Promise<Match[]> {
  console.log('🔍 Matching entities against PPP loans...');
  
  const result = await pool.query(`
    SELECT 
      e.id AS entity_id,
      e.canonical_name AS entity_name,
      p.id AS source_id,
      p.borrower_name AS source_name,
      similarity(e.canonical_name, p.borrower_name) AS score
    FROM entities e
    CROSS JOIN LATERAL (
      SELECT id, borrower_name
      FROM ppp_loans
      WHERE 
        borrower_name % e.canonical_name
        AND similarity(borrower_name, e.canonical_name) >= $1
      ORDER BY similarity(borrower_name, e.canonical_name) DESC
      LIMIT 5
    ) p
    WHERE e.entity_type IN ('person', 'organization')
  `, [MATCH_THRESHOLD]);

  return result.rows.map((row) => ({
    entityId: row.entity_id,
    entityName: row.entity_name,
    source: 'ppp' as const,
    sourceId: row.source_id,
    sourceName: row.source_name,
    score: row.score,
  }));
}

async function findFECMatches(): Promise<Match[]> {
  console.log('🔍 Matching entities against FEC contributions...');
  
  const result = await pool.query(`
    SELECT 
      e.id AS entity_id,
      e.canonical_name AS entity_name,
      f.id AS source_id,
      f.contributor_name AS source_name,
      similarity(e.canonical_name, f.contributor_name) AS score
    FROM entities e
    CROSS JOIN LATERAL (
      SELECT id, contributor_name
      FROM fec_contributions
      WHERE 
        contributor_name % e.canonical_name
        AND similarity(contributor_name, e.canonical_name) >= $1
      ORDER BY similarity(contributor_name, e.canonical_name) DESC
      LIMIT 5
    ) f
    WHERE e.entity_type = 'person'
  `, [MATCH_THRESHOLD]);

  return result.rows.map((row) => ({
    entityId: row.entity_id,
    entityName: row.entity_name,
    source: 'fec' as const,
    sourceId: row.source_id,
    sourceName: row.source_name,
    score: row.score,
  }));
}

async function findGrantsMatches(): Promise<Match[]> {
  console.log('🔍 Matching entities against federal grants...');
  
  const result = await pool.query(`
    SELECT 
      e.id AS entity_id,
      e.canonical_name AS entity_name,
      g.id AS source_id,
      g.recipient_name AS source_name,
      similarity(e.canonical_name, g.recipient_name) AS score
    FROM entities e
    CROSS JOIN LATERAL (
      SELECT id, recipient_name
      FROM federal_grants
      WHERE 
        recipient_name % e.canonical_name
        AND similarity(recipient_name, e.canonical_name) >= $1
      ORDER BY similarity(recipient_name, e.canonical_name) DESC
      LIMIT 5
    ) g
    WHERE e.entity_type IN ('person', 'organization')
  `, [MATCH_THRESHOLD]);

  return result.rows.map((row) => ({
    entityId: row.entity_id,
    entityName: row.entity_name,
    source: 'grants' as const,
    sourceId: row.source_id,
    sourceName: row.source_name,
    score: row.score,
  }));
}

async function saveMatches(matches: Match[]): Promise<void> {
  if (matches.length === 0) return;

  const values = matches.map((m) => 
    `(${m.entityId}, '${m.source}', ${m.sourceId}, ${m.score}, 'fuzzy')`
  ).join(',\n');

  await pool.query(`
    INSERT INTO entity_crossref_matches (entity_id, source, source_id, match_score, match_method)
    VALUES ${values}
    ON CONFLICT DO NOTHING
  `);
}

async function updateEntityCrossRefSummary(): Promise<void> {
  console.log('📊 Updating entity cross-reference summaries...');

  // Update PPP matches
  await pool.query(`
    UPDATE entities e
    SET ppp_matches = (
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'borrower', p.borrower_name,
        'amount', p.loan_amount,
        'score', m.match_score
      ))
      FROM entity_crossref_matches m
      JOIN ppp_loans p ON m.source_id = p.id
      WHERE m.entity_id = e.id AND m.source = 'ppp' AND NOT m.false_positive
    )
    WHERE EXISTS (
      SELECT 1 FROM entity_crossref_matches m
      WHERE m.entity_id = e.id AND m.source = 'ppp'
    )
  `);

  // Update FEC matches
  await pool.query(`
    UPDATE entities e
    SET fec_matches = (
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id,
        'contributor', f.contributor_name,
        'candidate', f.candidate_name,
        'amount', f.amount,
        'score', m.match_score
      ))
      FROM entity_crossref_matches m
      JOIN fec_contributions f ON m.source_id = f.id
      WHERE m.entity_id = e.id AND m.source = 'fec' AND NOT m.false_positive
    )
    WHERE EXISTS (
      SELECT 1 FROM entity_crossref_matches m
      WHERE m.entity_id = e.id AND m.source = 'fec'
    )
  `);

  // Update grants matches
  await pool.query(`
    UPDATE entities e
    SET grants_matches = (
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id,
        'recipient', g.recipient_name,
        'agency', g.awarding_agency,
        'amount', g.award_amount,
        'score', m.match_score
      ))
      FROM entity_crossref_matches m
      JOIN federal_grants g ON m.source_id = g.id
      WHERE m.entity_id = e.id AND m.source = 'grants' AND NOT m.false_positive
    )
    WHERE EXISTS (
      SELECT 1 FROM entity_crossref_matches m
      WHERE m.entity_id = e.id AND m.source = 'grants'
    )
  `);
}

async function main() {
  console.log('🔗 Starting cross-reference matching...\n');

  // Find all matches
  const pppMatches = await findPPPMatches();
  console.log(`   Found ${pppMatches.length} PPP matches`);
  
  const fecMatches = await findFECMatches();
  console.log(`   Found ${fecMatches.length} FEC matches`);
  
  const grantsMatches = await findGrantsMatches();
  console.log(`   Found ${grantsMatches.length} grants matches`);

  // Save matches
  console.log('\n💾 Saving matches to database...');
  await saveMatches(pppMatches);
  await saveMatches(fecMatches);
  await saveMatches(grantsMatches);

  // Update entity summaries
  await updateEntityCrossRefSummary();

  const totalMatches = pppMatches.length + fecMatches.length + grantsMatches.length;
  console.log(`\n✅ Cross-reference matching complete!`);
  console.log(`   Total matches: ${totalMatches}`);
  console.log(`   PPP: ${pppMatches.length}`);
  console.log(`   FEC: ${fecMatches.length}`);
  console.log(`   Grants: ${grantsMatches.length}`);

  await close();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
