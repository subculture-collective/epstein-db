const API_BASE = '/api'

export interface Stats {
  documents: number
  entities: number
  triples: number
  pppLoans: number
  fecRecords: number
  grants: number
  patterns: number
}

export interface Entity {
  id: number
  canonicalName: string
  entityType: string
  layer: number | null
  description?: string
  documentCount: number
  connectionCount: number
  aliases?: string[]
  pppMatches?: any[]
  fecMatches?: any[]
  grantsMatches?: any[]
}

export interface Document {
  id: number
  docId: string
  datasetId: number
  documentType?: string
  summary?: string
  detailedSummary?: string
  dateEarliest?: string
  dateLatest?: string
  contentTags?: string[]
  pageCount?: number
}

export interface Connection {
  id: number
  canonicalName: string
  entityType: string
  layer: number | null
  sharedDocs: number
}

export interface NetworkData {
  nodes: Array<{
    id: number
    canonicalName: string
    entityType: string
    layer: number | null
    documentCount: number
    connectionCount: number
  }>
  edges: Array<{
    source: number
    target: number
    weight: number
  }>
  stats: {
    nodeCount: number
    edgeCount: number
  }
}

export interface Pattern {
  id: number
  title: string
  description: string
  patternType: string
  confidence: number | null
  status: string
  discoveredAt: string
}

export interface SearchResult {
  id: number
  docId: string
  documentType?: string
  summary?: string
  rank: number
  snippet?: string
}

// Stats
export async function getStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/stats`)
  if (!res.ok) throw new Error('Failed to fetch stats')
  return res.json()
}

// Entities
export async function searchEntities(params: {
  q?: string
  type?: string
  layer?: string
  limit?: number
}): Promise<{ entities: Entity[]; count: number }> {
  const searchParams = new URLSearchParams()
  if (params.q) searchParams.set('q', params.q)
  if (params.type) searchParams.set('type', params.type)
  if (params.layer) searchParams.set('layer', params.layer)
  if (params.limit) searchParams.set('limit', params.limit.toString())

  const res = await fetch(`${API_BASE}/entities?${searchParams}`)
  if (!res.ok) throw new Error('Failed to search entities')
  return res.json()
}

export async function getEntity(id: number): Promise<Entity> {
  const res = await fetch(`${API_BASE}/entities/${id}`)
  if (!res.ok) throw new Error('Failed to fetch entity')
  return res.json()
}

export async function getEntityConnections(
  id: number,
  limit?: number
): Promise<{ connections: Connection[]; count: number }> {
  const params = limit ? `?limit=${limit}` : ''
  const res = await fetch(`${API_BASE}/entities/${id}/connections${params}`)
  if (!res.ok) throw new Error('Failed to fetch connections')
  return res.json()
}

export async function getEntityDocuments(
  id: number,
  limit?: number
): Promise<{ documents: Document[]; count: number }> {
  const params = limit ? `?limit=${limit}` : ''
  const res = await fetch(`${API_BASE}/entities/${id}/documents${params}`)
  if (!res.ok) throw new Error('Failed to fetch documents')
  return res.json()
}

// Documents
export async function listDocuments(params: {
  type?: string
  dataset?: string
  limit?: number
  offset?: number
}): Promise<{ documents: Document[]; count: number; offset: number; limit: number }> {
  const searchParams = new URLSearchParams()
  if (params.type) searchParams.set('type', params.type)
  if (params.dataset) searchParams.set('dataset', params.dataset)
  if (params.limit) searchParams.set('limit', params.limit.toString())
  if (params.offset) searchParams.set('offset', params.offset.toString())

  const res = await fetch(`${API_BASE}/documents?${searchParams}`)
  if (!res.ok) throw new Error('Failed to list documents')
  return res.json()
}

export async function getDocument(id: number): Promise<Document> {
  const res = await fetch(`${API_BASE}/documents/${id}`)
  if (!res.ok) throw new Error('Failed to fetch document')
  return res.json()
}

export async function getDocumentText(id: number): Promise<{ id: number; text: string }> {
  const res = await fetch(`${API_BASE}/documents/${id}/text`)
  if (!res.ok) throw new Error('Failed to fetch document text')
  return res.json()
}

export async function getDocumentEntities(
  id: number
): Promise<{ entities: Array<Entity & { mentionCount: number }>; count: number }> {
  const res = await fetch(`${API_BASE}/documents/${id}/entities`)
  if (!res.ok) throw new Error('Failed to fetch document entities')
  return res.json()
}

// Network
export async function getNetwork(params?: {
  limit?: number
  minConnections?: number
}): Promise<NetworkData> {
  const searchParams = new URLSearchParams()
  if (params?.limit) searchParams.set('limit', params.limit.toString())
  if (params?.minConnections) searchParams.set('minConnections', params.minConnections.toString())

  const res = await fetch(`${API_BASE}/network?${searchParams}`)
  if (!res.ok) throw new Error('Failed to fetch network')
  return res.json()
}

export async function getNetworkByLayer(): Promise<{
  layers: Array<{
    layer: number
    entities: Entity[]
    count: number
  }>
}> {
  const res = await fetch(`${API_BASE}/network/layers`)
  if (!res.ok) throw new Error('Failed to fetch network layers')
  return res.json()
}

// Patterns
export async function listPatterns(params?: {
  status?: string
  type?: string
}): Promise<{ patterns: Pattern[]; count: number }> {
  const searchParams = new URLSearchParams()
  if (params?.status) searchParams.set('status', params.status)
  if (params?.type) searchParams.set('type', params.type)

  const res = await fetch(`${API_BASE}/patterns?${searchParams}`)
  if (!res.ok) throw new Error('Failed to list patterns')
  return res.json()
}

export async function getPattern(id: number): Promise<{
  pattern: Pattern & { entityIds: number[]; evidence: any; notes?: string }
  entities: Entity[]
}> {
  const res = await fetch(`${API_BASE}/patterns/${id}`)
  if (!res.ok) throw new Error('Failed to fetch pattern')
  return res.json()
}

// Search
export async function fullTextSearch(
  query: string,
  limit?: number
): Promise<{ results: SearchResult[]; count: number; query: string }> {
  const params = new URLSearchParams({ q: query })
  if (limit) params.set('limit', limit.toString())

  const res = await fetch(`${API_BASE}/search?${params}`)
  if (!res.ok) throw new Error('Failed to search')
  return res.json()
}

// Cross-reference
export async function searchPPP(
  query: string,
  limit?: number
): Promise<{ results: any[]; count: number }> {
  const params = new URLSearchParams({ q: query })
  if (limit) params.set('limit', limit.toString())

  const res = await fetch(`${API_BASE}/crossref/ppp?${params}`)
  if (!res.ok) throw new Error('Failed to search PPP')
  return res.json()
}

export async function searchFEC(
  query: string,
  candidate?: string,
  limit?: number
): Promise<{ results: any[]; count: number }> {
  const params = new URLSearchParams({ q: query })
  if (candidate) params.set('candidate', candidate)
  if (limit) params.set('limit', limit.toString())

  const res = await fetch(`${API_BASE}/crossref/fec?${params}`)
  if (!res.ok) throw new Error('Failed to search FEC')
  return res.json()
}

export async function searchGrants(
  query: string,
  agency?: string,
  limit?: number
): Promise<{ results: any[]; count: number }> {
  const params = new URLSearchParams({ q: query })
  if (agency) params.set('agency', agency)
  if (limit) params.set('limit', limit.toString())

  const res = await fetch(`${API_BASE}/crossref/grants?${params}`)
  if (!res.ok) throw new Error('Failed to search grants')
  return res.json()
}
