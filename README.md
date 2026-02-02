# Epstein Files Database

A searchable database and network analysis tool for the DOJ Epstein Files release. Built to make public records accessible, cross-referenced, and analyzable.

## What This Does

1. **Entity Extraction** — Extracts names, organizations, locations, and dates from 4,055 DOJ documents
2. **Relationship Mapping** — Builds a graph of connections based on document co-occurrence
3. **Layer Classification** — Classifies entities by degree of separation from Jeffrey Epstein
4. **Cross-Reference Engine** — Fuzzy-matches entities against:
   - PPP loan data (SBA)
   - FEC campaign contributions
   - Federal grant recipients
5. **Pattern Detection Agent** — AI agent specialized in finding non-obvious connections

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Tailwind)               │
│  • Search Interface  • Network Visualization  • Document Viewer │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                        API Server (Go)                           │
│  • REST Endpoints  • Full-text Search  • Graph Queries          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                        Data Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  PostgreSQL  │  │  Neo4j       │  │  Typesense/Meilisearch │ │
│  │  Entities    │  │  Graph       │  │  Full-text Search      │ │
│  │  Documents   │  │  Relations   │  │                        │ │
│  │  Cross-refs  │  │              │  │                        │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                     Extraction Pipeline (TypeScript)             │
│  • OCR Processing  • NER Extraction  • Relationship Inference   │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Frontend | React + Tailwind + Vite | Fast, modern, type-safe |
| API | Go (Fiber/Echo) | Performance for graph queries |
| Primary DB | PostgreSQL | Structured data, JSONB, full-text |
| Graph DB | Neo4j | Relationship traversal at scale |
| Search | Typesense | Fast fuzzy search, typo-tolerant |
| Extraction | TypeScript + LLM | Entity extraction, deduplication |
| Pattern Agent | OpenClaw sub-agent | AI-driven connection discovery |

## Data Sources

### Primary: DOJ Epstein Files
- **4,055 documents** (EFTA00000001 through EFTA00008528)
- **1.77M lines** of OCR text
- **157GB** raw data (PDFs, images, scans)
- Source: https://www.justice.gov/epstein

### Cross-Reference Datasets
- **PPP Loans**: SBA FOIA data (https://data.sba.gov/dataset/ppp-foia)
- **FEC Contributions**: Federal Election Commission (https://www.fec.gov/data/)
- **Federal Grants**: USASpending.gov (https://www.usaspending.gov/download_center/custom_award_data)

## Layer Classification

| Layer | Definition | Example |
|-------|------------|---------|
| **L0** | Jeffrey Epstein himself | — |
| **L1** | Direct associates (named in documents with Epstein) | Ghislaine Maxwell |
| **L2** | One degree removed (connected to L1 but not directly to Epstein) | — |
| **L3** | Two degrees removed | — |

## Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js 20+
- Go 1.21+
- PostgreSQL 16+ (or use Docker)
- Neo4j 5+ (or use Docker)

### Quick Start

```bash
# Clone the repo
git clone https://github.com/subculture-collective/epstein-db.git
cd epstein-db

# Start databases
docker-compose up -d

# Install dependencies
npm install
cd api && go mod download && cd ..

# Run extraction pipeline (requires OpenAI-compatible API)
cp .env.example .env
# Edit .env with your API keys

npm run extract

# Start the API server
cd api && go run . &

# Start the frontend
npm run dev
```

## Project Structure

```
epstein-db/
├── api/                    # Go API server
│   ├── cmd/                # Entry points
│   ├── internal/           # Internal packages
│   │   ├── handlers/       # HTTP handlers
│   │   ├── db/             # Database access
│   │   ├── graph/          # Neo4j operations
│   │   └── search/         # Typesense operations
│   └── pkg/                # Public packages
│
├── extraction/             # TypeScript extraction pipeline
│   ├── src/
│   │   ├── ocr/            # OCR processing
│   │   ├── ner/            # Named Entity Recognition
│   │   ├── dedup/          # Entity deduplication
│   │   └── cross-ref/      # Cross-reference matching
│   └── scripts/            # Pipeline scripts
│
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── pages/          # Route pages
│   │   ├── hooks/          # Custom hooks
│   │   └── api/            # API client
│   └── public/
│
├── agents/                 # AI agents
│   └── pattern-finder/     # Connection discovery agent
│
├── data/                   # Data directory (gitignored)
│   ├── raw/                # Symlink to DataSources
│   ├── processed/          # Extracted entities/relations
│   ├── crossref/           # PPP, FEC, grants data
│   └── exports/            # Generated exports
│
├── docker-compose.yml      # Database services
├── schema/                 # Database schemas
│   ├── postgres/           # SQL migrations
│   └── neo4j/              # Cypher constraints
│
└── docs/                   # Documentation
    ├── ARCHITECTURE.md
    ├── DATA_MODEL.md
    └── CONTRIBUTING.md
```

## Roadmap

### Phase 1: Foundation ✅
- [x] Repository setup
- [ ] Database schema design
- [ ] Docker compose for databases
- [ ] Basic extraction pipeline

### Phase 2: Entity Extraction
- [ ] OCR text ingestion
- [ ] Named Entity Recognition (NER)
- [ ] Entity deduplication (LLM-assisted)
- [ ] Document-entity relationships

### Phase 3: Graph Construction
- [ ] Neo4j schema
- [ ] Co-occurrence relationship building
- [ ] Layer classification algorithm
- [ ] Graph API endpoints

### Phase 4: Cross-Reference
- [ ] PPP loan data ingestion
- [ ] FEC contribution data ingestion
- [ ] Federal grants data ingestion
- [ ] Fuzzy matching engine

### Phase 5: Frontend
- [ ] Search interface
- [ ] Network visualization (D3/Force-Graph)
- [ ] Document viewer
- [ ] Entity detail pages

### Phase 6: Pattern Agent
- [ ] Agent architecture design
- [ ] Connection hypothesis generation
- [ ] Validation pipeline
- [ ] Report generation

## Contributing

This is an open research project. Contributions welcome:
- Entity extraction improvements
- Fuzzy matching algorithms
- UI/UX improvements
- Additional cross-reference datasets
- Pattern detection strategies

## License

MIT License. The code is open source. The documents are public records.

## Disclaimer

This is an independent research project. We make no representations about the completeness or accuracy of the analysis. This tool surfaces connections — it does not assert guilt, criminality, or wrongdoing.
