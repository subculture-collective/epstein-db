package handlers

import (
	"context"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/subculture-collective/epstein-db/api/internal/db"
)

// ListDocuments returns a paginated list of documents
func ListDocuments(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	limitStr := c.Query("limit", "50")
	limit, _ := strconv.Atoi(limitStr)
	if limit > 200 {
		limit = 200
	}

	offsetStr := c.Query("offset", "0")
	offset, _ := strconv.Atoi(offsetStr)

	docType := c.Query("type", "")
	dataset := c.Query("dataset", "")

	rows, err := pool.Query(ctx, `
		SELECT id, doc_id, dataset_id, document_type, summary, date_earliest, date_latest
		FROM documents
		WHERE ($1 = '' OR document_type = $1)
		  AND ($2 = '' OR dataset_id = $2::int)
		ORDER BY doc_id
		LIMIT $3 OFFSET $4
	`, docType, dataset, limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var documents []fiber.Map
	for rows.Next() {
		var id, datasetID int
		var docID string
		var docType, summary *string
		var dateEarliest, dateLatest *string

		if err := rows.Scan(&id, &docID, &datasetID, &docType, &summary, &dateEarliest, &dateLatest); err != nil {
			continue
		}

		documents = append(documents, fiber.Map{
			"id":           id,
			"docId":        docID,
			"datasetId":    datasetID,
			"documentType": docType,
			"summary":      summary,
			"dateEarliest": dateEarliest,
			"dateLatest":   dateLatest,
		})
	}

	return c.JSON(fiber.Map{
		"documents": documents,
		"count":     len(documents),
		"offset":    offset,
		"limit":     limit,
	})
}

// GetDocument returns a single document by ID
func GetDocument(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid id"})
	}

	var doc struct {
		ID              int     `json:"id"`
		DocID           string  `json:"docId"`
		DatasetID       int     `json:"datasetId"`
		DocumentType    *string `json:"documentType"`
		Summary         *string `json:"summary"`
		DetailedSummary *string `json:"detailedSummary"`
		DateEarliest    *string `json:"dateEarliest"`
		DateLatest      *string `json:"dateLatest"`
		ContentTags     []byte  `json:"contentTags"`
		PageCount       *int    `json:"pageCount"`
	}

	err = pool.QueryRow(ctx, `
		SELECT id, doc_id, dataset_id, document_type, summary, detailed_summary,
			   date_earliest::text, date_latest::text, content_tags, page_count
		FROM documents WHERE id = $1
	`, id).Scan(
		&doc.ID, &doc.DocID, &doc.DatasetID, &doc.DocumentType,
		&doc.Summary, &doc.DetailedSummary, &doc.DateEarliest,
		&doc.DateLatest, &doc.ContentTags, &doc.PageCount,
	)

	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "document not found"})
	}

	return c.JSON(doc)
}

// GetDocumentText returns the full text of a document
func GetDocumentText(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid id"})
	}

	var text *string
	err = pool.QueryRow(ctx, "SELECT full_text FROM documents WHERE id = $1", id).Scan(&text)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "document not found"})
	}

	return c.JSON(fiber.Map{
		"id":   id,
		"text": text,
	})
}

// GetDocumentEntities returns entities mentioned in a document
func GetDocumentEntities(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid id"})
	}

	rows, err := pool.Query(ctx, `
		SELECT e.id, e.canonical_name, e.entity_type, e.layer, de.mention_count
		FROM entities e
		JOIN document_entities de ON e.id = de.entity_id
		WHERE de.document_id = $1
		ORDER BY de.mention_count DESC
	`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var entities []fiber.Map
	for rows.Next() {
		var entityID int
		var name, etype string
		var layer *int
		var mentions int

		if err := rows.Scan(&entityID, &name, &etype, &layer, &mentions); err != nil {
			continue
		}

		entities = append(entities, fiber.Map{
			"id":            entityID,
			"canonicalName": name,
			"entityType":    etype,
			"layer":         layer,
			"mentionCount":  mentions,
		})
	}

	return c.JSON(fiber.Map{
		"entities": entities,
		"count":    len(entities),
	})
}

// FullTextSearch searches document text
func FullTextSearch(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	query := c.Query("q", "")
	if query == "" {
		return c.Status(400).JSON(fiber.Map{"error": "query required"})
	}

	limitStr := c.Query("limit", "20")
	limit, _ := strconv.Atoi(limitStr)
	if limit > 100 {
		limit = 100
	}

	rows, err := pool.Query(ctx, `
		SELECT id, doc_id, document_type, summary,
			   ts_rank(to_tsvector('english', full_text), plainto_tsquery('english', $1)) AS rank,
			   ts_headline('english', full_text, plainto_tsquery('english', $1), 
			   			   'MaxWords=50, MinWords=20, StartSel=<mark>, StopSel=</mark>') AS snippet
		FROM documents
		WHERE to_tsvector('english', full_text) @@ plainto_tsquery('english', $1)
		ORDER BY rank DESC
		LIMIT $2
	`, query, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var results []fiber.Map
	for rows.Next() {
		var id int
		var docID string
		var docType, summary, snippet *string
		var rank float64

		if err := rows.Scan(&id, &docID, &docType, &summary, &rank, &snippet); err != nil {
			continue
		}

		results = append(results, fiber.Map{
			"id":           id,
			"docId":        docID,
			"documentType": docType,
			"summary":      summary,
			"rank":         rank,
			"snippet":      snippet,
		})
	}

	return c.JSON(fiber.Map{
		"results": results,
		"count":   len(results),
		"query":   query,
	})
}
