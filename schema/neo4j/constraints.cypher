// Neo4j Cypher constraints and initial setup
// Run these after Neo4j starts

// ============================================================================
// CONSTRAINTS
// ============================================================================

// Entity uniqueness
CREATE CONSTRAINT entity_unique IF NOT EXISTS
FOR (e:Entity) REQUIRE (e.canonicalName, e.type) IS UNIQUE;

// Document uniqueness
CREATE CONSTRAINT document_unique IF NOT EXISTS
FOR (d:Document) REQUIRE d.docId IS UNIQUE;

// ============================================================================
// INDEXES
// ============================================================================

// Entity indexes
CREATE INDEX entity_name IF NOT EXISTS FOR (e:Entity) ON (e.canonicalName);
CREATE INDEX entity_type IF NOT EXISTS FOR (e:Entity) ON (e.type);
CREATE INDEX entity_layer IF NOT EXISTS FOR (e:Entity) ON (e.layer);

// Full-text search index on entity names
CREATE FULLTEXT INDEX entity_search IF NOT EXISTS FOR (e:Entity) ON EACH [e.canonicalName, e.aliases];

// Document indexes
CREATE INDEX document_docid IF NOT EXISTS FOR (d:Document) ON (d.docId);
CREATE INDEX document_type IF NOT EXISTS FOR (d:Document) ON (d.documentType);

// ============================================================================
// ENTITY TYPES (Labels)
// ============================================================================
// We use labels for entity types:
// - :Person
// - :Organization
// - :Location
// - :Entity (base label, all entities have this)

// ============================================================================
// RELATIONSHIP TYPES
// ============================================================================
// - MENTIONED_IN: Entity -> Document (entity appears in document)
// - CONNECTED_TO: Entity -> Entity (co-occurrence relationship)
// - HAS_RELATIONSHIP: Entity -> Entity with action property (from triples)
// - CROSSREF_MATCH: Entity -> CrossRefRecord (PPP, FEC, Grants)

// ============================================================================
// INITIAL DATA
// ============================================================================

// Create Jeffrey Epstein as the root node
MERGE (e:Entity:Person {canonicalName: 'Jeffrey Epstein', type: 'person'})
SET e.layer = 0,
    e.description = 'American financier and convicted sex offender',
    e.aliases = ['Jeffrey E. Epstein', 'J. Epstein', 'Epstein', 'JE'],
    e.createdAt = datetime();

// ============================================================================
// HELPER PROCEDURES
// ============================================================================

// Calculate layer for an entity based on shortest path to Epstein
// Usage: CALL calculateLayer($entityName) YIELD layer
// This needs APOC plugin installed

// CALL apoc.custom.asProcedure(
//   'calculateLayer',
//   '
//   MATCH (epstein:Entity {canonicalName: "Jeffrey Epstein"})
//   MATCH (target:Entity {canonicalName: $entityName})
//   MATCH path = shortestPath((epstein)-[:CONNECTED_TO*]-(target))
//   RETURN length(path) AS layer
//   ',
//   'read',
//   [['layer', 'INTEGER']],
//   [['entityName', 'STRING']]
// );

// ============================================================================
// EXAMPLE QUERIES
// ============================================================================

// Find all Layer 1 entities (direct connections to Epstein)
// MATCH (epstein:Entity {canonicalName: 'Jeffrey Epstein'})-[:CONNECTED_TO]-(layer1:Entity)
// RETURN layer1.canonicalName, layer1.type;

// Find shared connections between two entities
// MATCH (a:Entity {canonicalName: $name1})-[:CONNECTED_TO]-(shared:Entity)-[:CONNECTED_TO]-(b:Entity {canonicalName: $name2})
// RETURN shared.canonicalName, shared.type;

// Find documents where two entities appear together
// MATCH (a:Entity {canonicalName: $name1})-[:MENTIONED_IN]->(d:Document)<-[:MENTIONED_IN]-(b:Entity {canonicalName: $name2})
// RETURN d.docId, d.summary;

// Get entity's network up to N hops
// MATCH path = (e:Entity {canonicalName: $name})-[:CONNECTED_TO*1..3]-(connected:Entity)
// RETURN path;

// Find money flows (entities connected through financial documents)
// MATCH (a:Entity)-[:MENTIONED_IN]->(d:Document {documentType: 'financial'})<-[:MENTIONED_IN]-(b:Entity)
// WHERE a <> b
// RETURN a.canonicalName, b.canonicalName, count(d) AS sharedFinancialDocs
// ORDER BY sharedFinancialDocs DESC;
