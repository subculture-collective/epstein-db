import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: config.ANTHROPIC_API_KEY,
});

// ============================================================================
// SCHEMAS
// ============================================================================

export const EntitySchema = z.object({
  name: z.string(),
  type: z.enum(['person', 'organization', 'location', 'date', 'reference', 'financial']),
  context: z.string().optional(),
});

export const TripleSchema = z.object({
  subject: z.string(),
  subjectType: z.enum(['person', 'organization', 'location']),
  predicate: z.string(),
  object: z.string(),
  objectType: z.enum(['person', 'organization', 'location', 'date', 'reference', 'financial']),
  location: z.string().optional(),
  timestamp: z.string().optional(),
  explicitTopic: z.string().optional(),
  implicitTopic: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const DocumentAnalysisSchema = z.object({
  summary: z.string(),
  detailedSummary: z.string(),
  documentType: z.string(),
  dateEarliest: z.string().nullable(),
  dateLatest: z.string().nullable(),
  contentTags: z.array(z.string()),
  entities: z.array(EntitySchema),
  triples: z.array(TripleSchema),
});

export type Entity = z.infer<typeof EntitySchema>;
export type Triple = z.infer<typeof TripleSchema>;
export type DocumentAnalysis = z.infer<typeof DocumentAnalysisSchema>;

// ============================================================================
// EXTRACTION PROMPTS
// ============================================================================

const EXTRACTION_SYSTEM_PROMPT = `You are an expert document analyst specializing in legal documents, financial records, and correspondence. Your task is to extract structured information from documents related to the Jeffrey Epstein case.

Extract the following:

1. **Entities**: All people, organizations, locations, dates, document references, and financial amounts mentioned.
2. **Relationships (Triples)**: Subject-Predicate-Object relationships between entities.
3. **Document Analysis**: Summary, type classification, date range, and content tags.

Be thorough but precise. If information is unclear or partially redacted, note what you can determine. Focus on factual extraction, not interpretation.

IMPORTANT: 
- Normalize names where possible (e.g., "J. Epstein" → "Jeffrey Epstein" if context confirms)
- Include context snippets for important entities
- Extract temporal information when available
- Tag relationships with relevant categories (legal, financial, travel, social, etc.)`;

const EXTRACTION_USER_PROMPT = (text: string) => `Analyze this document and extract structured information.

<document>
${text}
</document>

Respond with a JSON object matching this schema:
{
  "summary": "One sentence summary of the document",
  "detailedSummary": "A paragraph explaining the document's content and significance",
  "documentType": "Type of document (e.g., deposition, email, financial record, flight log, etc.)",
  "dateEarliest": "YYYY-MM-DD or null if no dates",
  "dateLatest": "YYYY-MM-DD or null if no dates",
  "contentTags": ["tag1", "tag2", ...],
  "entities": [
    {"name": "Full Name", "type": "person|organization|location|date|reference|financial", "context": "brief context"}
  ],
  "triples": [
    {
      "subject": "Entity Name",
      "subjectType": "person|organization|location",
      "predicate": "action/relationship verb",
      "object": "Entity Name",
      "objectType": "person|organization|location|date|reference|financial",
      "location": "where (optional)",
      "timestamp": "YYYY-MM-DD (optional)",
      "explicitTopic": "stated subject matter (optional)",
      "implicitTopic": "inferred subject matter (optional)",
      "tags": ["legal", "financial", "travel", etc.]
    }
  ]
}

Return ONLY valid JSON, no markdown or explanation.`;

// ============================================================================
// EXTRACTION FUNCTION
// ============================================================================

export async function extractFromDocument(
  docId: string,
  text: string
): Promise<DocumentAnalysis> {
  // Truncate very long documents
  const maxChars = 100000;
  const truncatedText = text.length > maxChars 
    ? text.slice(0, maxChars) + '\n\n[TRUNCATED - document continues...]' 
    : text;

  const response = await anthropic.messages.create({
    model: config.LLM_MODEL,
    max_tokens: 8192,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: EXTRACTION_USER_PROMPT(truncatedText),
      },
    ],
  });

  // Extract text content
  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error(`Unexpected response type: ${content.type}`);
  }

  // Parse JSON
  let parsed: unknown;
  try {
    // Try to extract JSON from the response (sometimes wrapped in markdown)
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error(`Failed to parse JSON for ${docId}:`, content.text.slice(0, 500));
    throw new Error(`JSON parse error: ${error}`);
  }

  // Validate against schema
  const result = DocumentAnalysisSchema.parse(parsed);
  
  return result;
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

const DEDUP_SYSTEM_PROMPT = `You are an expert at identifying when different name variations refer to the same entity. Given a list of entity names, group them by the actual entity they refer to.

Consider:
- Name variations (J. Smith, John Smith, John Q. Smith)
- Nicknames and aliases
- Organizational name variations (LLC vs Inc)
- Typos and OCR errors

Be conservative - only merge entities when you're confident they're the same.`;

const DEDUP_USER_PROMPT = (entities: string[]) => `Group these entity names by the actual entity they refer to. Return a JSON object where keys are canonical names and values are arrays of aliases.

Entities:
${entities.map((e) => `- ${e}`).join('\n')}

Return JSON like:
{
  "Jeffrey Epstein": ["J. Epstein", "Epstein", "Jeffrey E. Epstein"],
  "Ghislaine Maxwell": ["G. Maxwell", "Maxwell"]
}

Return ONLY valid JSON.`;

export async function deduplicateEntities(
  entities: string[]
): Promise<Record<string, string[]>> {
  const response = await anthropic.messages.create({
    model: config.LLM_MODEL,
    max_tokens: 4096,
    system: DEDUP_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: DEDUP_USER_PROMPT(entities),
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error(`Unexpected response type: ${content.type}`);
  }

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in dedup response');
  }

  return JSON.parse(jsonMatch[0]);
}
