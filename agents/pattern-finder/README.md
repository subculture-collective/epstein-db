# Pattern Finder Agent

An AI agent specialized in discovering non-obvious connections, patterns, and relationships within the Epstein Files database.

## Purpose

While the extraction pipeline identifies explicit entities and relationships, the Pattern Finder looks for:

1. **Indirect Connections** — Entities that appear in similar contexts but are never directly linked
2. **Temporal Patterns** — Activities that cluster around specific dates or events
3. **Financial Flows** — Money movement patterns across entities
4. **Network Anomalies** — Unusually dense or sparse connection patterns
5. **Cross-Reference Insights** — What PPP/FEC/Grants matches reveal about entities

## How It Works

The agent runs periodically (or on-demand) and:

1. **Samples the Graph** — Pulls subgraphs around high-degree or interesting entities
2. **Generates Hypotheses** — Uses LLM to identify potential patterns
3. **Validates Hypotheses** — Checks evidence in the actual documents
4. **Reports Findings** — Stores validated patterns with evidence chains

## Agent Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Pattern Finder Agent                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Sampling Module                                              │
│     • Random walk from high-degree nodes                         │
│     • Temporal window sampling                                   │
│     • Cross-reference focused sampling                           │
│                                                                  │
│  2. Hypothesis Generator (LLM)                                   │
│     • Pattern recognition prompts                                │
│     • Anomaly detection prompts                                  │
│     • Connection inference prompts                               │
│                                                                  │
│  3. Evidence Validator                                           │
│     • Document retrieval                                         │
│     • Citation extraction                                        │
│     • Confidence scoring                                         │
│                                                                  │
│  4. Report Generator                                             │
│     • Pattern summary                                            │
│     • Evidence chain                                             │
│     • Visualization data                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Pattern Types

### Financial Patterns
- Money flows between entities
- Unusual transaction timing
- Shell company connections
- Donation clustering

### Travel Patterns
- Co-location events
- Flight log correlations
- Property connections
- Event attendance

### Organizational Patterns
- Board memberships
- Foundation connections
- Employment relationships
- Legal representation

### Temporal Patterns
- Activity clustering around dates
- Gaps in documentation
- Correlated timelines

## Usage

```bash
# Run a pattern discovery session
npm run agent:pattern-finder

# Focus on specific entity
npm run agent:pattern-finder -- --entity "Ghislaine Maxwell"

# Focus on date range
npm run agent:pattern-finder -- --from "2005-01-01" --to "2010-12-31"

# Focus on pattern type
npm run agent:pattern-finder -- --type financial
```

## Output

Patterns are stored in the `pattern_findings` table with:
- Title and description
- Involved entities
- Evidence (documents, relationships)
- Confidence score
- Status (hypothesis, validated, rejected)

## Integration with OpenClaw

This agent can be spawned as a sub-agent from OpenClaw:

```typescript
sessions_spawn({
  task: "Analyze the network around Les Wexner for financial patterns",
  label: "pattern-finder-wexner",
})
```
