package handlers

import (
	"context"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/subculture-collective/epstein-db/api/internal/db"
)

// GetStats returns database statistics
func GetStats(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	var stats struct {
		Documents    int64  `json:"documents"`
		Entities     int64  `json:"entities"`
		Triples      int64  `json:"triples"`
		PPPLoans     int64  `json:"pppLoans"`
		FECRecords   int64  `json:"fecRecords"`
		Grants       int64  `json:"grants"`
		Patterns     int64  `json:"patterns"`
	}

	pool.QueryRow(ctx, "SELECT COUNT(*) FROM documents").Scan(&stats.Documents)
	pool.QueryRow(ctx, "SELECT COUNT(*) FROM entities").Scan(&stats.Entities)
	pool.QueryRow(ctx, "SELECT COUNT(*) FROM triples").Scan(&stats.Triples)
	pool.QueryRow(ctx, "SELECT COUNT(*) FROM ppp_loans").Scan(&stats.PPPLoans)
	pool.QueryRow(ctx, "SELECT COUNT(*) FROM fec_contributions").Scan(&stats.FECRecords)
	pool.QueryRow(ctx, "SELECT COUNT(*) FROM federal_grants").Scan(&stats.Grants)
	pool.QueryRow(ctx, "SELECT COUNT(*) FROM pattern_findings").Scan(&stats.Patterns)

	return c.JSON(stats)
}

// SearchEntities searches for entities by name
func SearchEntities(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	query := c.Query("q", "")
	limitStr := c.Query("limit", "20")
	limit, _ := strconv.Atoi(limitStr)
	if limit > 100 {
		limit = 100
	}

	entityType := c.Query("type", "")
	layer := c.Query("layer", "")

	sqlQuery := `
		SELECT id, canonical_name, entity_type, layer, document_count, connection_count
		FROM entities
		WHERE ($1 = '' OR canonical_name ILIKE '%' || $1 || '%' OR canonical_name % $1)
		  AND ($2 = '' OR entity_type = $2::entity_type)
		  AND ($3 = '' OR layer = $3::int)
		ORDER BY 
			CASE WHEN $1 != '' THEN similarity(canonical_name, $1) ELSE 0 END DESC,
			document_count DESC
		LIMIT $4
	`

	rows, err := pool.Query(ctx, sqlQuery, query, entityType, layer, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var entities []fiber.Map
	for rows.Next() {
		var id int
		var name, etype string
		var layerVal, docCount, connCount *int

		if err := rows.Scan(&id, &name, &etype, &layerVal, &docCount, &connCount); err != nil {
			continue
		}

		entities = append(entities, fiber.Map{
			"id":              id,
			"canonicalName":   name,
			"entityType":      etype,
			"layer":           layerVal,
			"documentCount":   docCount,
			"connectionCount": connCount,
		})
	}

	return c.JSON(fiber.Map{
		"entities": entities,
		"count":    len(entities),
	})
}

// GetEntity returns a single entity by ID
func GetEntity(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid id"})
	}

	var entity struct {
		ID              int     `json:"id"`
		CanonicalName   string  `json:"canonicalName"`
		EntityType      string  `json:"entityType"`
		Layer           *int    `json:"layer"`
		Description     *string `json:"description"`
		DocumentCount   *int    `json:"documentCount"`
		ConnectionCount *int    `json:"connectionCount"`
		Aliases         []byte  `json:"aliases"`
		PPPMatches      []byte  `json:"pppMatches"`
		FECMatches      []byte  `json:"fecMatches"`
		GrantsMatches   []byte  `json:"grantsMatches"`
	}

	err = pool.QueryRow(ctx, `
		SELECT id, canonical_name, entity_type, layer, description, 
			   document_count, connection_count, aliases,
			   ppp_matches, fec_matches, grants_matches
		FROM entities WHERE id = $1
	`, id).Scan(
		&entity.ID, &entity.CanonicalName, &entity.EntityType,
		&entity.Layer, &entity.Description, &entity.DocumentCount,
		&entity.ConnectionCount, &entity.Aliases,
		&entity.PPPMatches, &entity.FECMatches, &entity.GrantsMatches,
	)

	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "entity not found"})
	}

	return c.JSON(entity)
}

// GetEntityConnections returns entities connected to a given entity
func GetEntityConnections(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid id"})
	}

	limitStr := c.Query("limit", "50")
	limit, _ := strconv.Atoi(limitStr)
	if limit > 200 {
		limit = 200
	}

	rows, err := pool.Query(ctx, `
		SELECT 
			e2.id, e2.canonical_name, e2.entity_type, e2.layer,
			COUNT(DISTINCT d.id) AS shared_docs
		FROM document_entities de1
		JOIN document_entities de2 ON de1.document_id = de2.document_id AND de1.entity_id != de2.entity_id
		JOIN entities e2 ON de2.entity_id = e2.id
		JOIN documents d ON de1.document_id = d.id
		WHERE de1.entity_id = $1
		GROUP BY e2.id, e2.canonical_name, e2.entity_type, e2.layer
		ORDER BY shared_docs DESC
		LIMIT $2
	`, id, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var connections []fiber.Map
	for rows.Next() {
		var connID int
		var name, etype string
		var layerVal *int
		var sharedDocs int

		if err := rows.Scan(&connID, &name, &etype, &layerVal, &sharedDocs); err != nil {
			continue
		}

		connections = append(connections, fiber.Map{
			"id":            connID,
			"canonicalName": name,
			"entityType":    etype,
			"layer":         layerVal,
			"sharedDocs":    sharedDocs,
		})
	}

	return c.JSON(fiber.Map{
		"connections": connections,
		"count":       len(connections),
	})
}

// GetEntityDocuments returns documents mentioning an entity
func GetEntityDocuments(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid id"})
	}

	limitStr := c.Query("limit", "50")
	limit, _ := strconv.Atoi(limitStr)

	rows, err := pool.Query(ctx, `
		SELECT d.id, d.doc_id, d.document_type, d.summary, d.date_earliest, d.date_latest
		FROM documents d
		JOIN document_entities de ON d.id = de.document_id
		WHERE de.entity_id = $1
		ORDER BY d.date_earliest DESC NULLS LAST
		LIMIT $2
	`, id, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var documents []fiber.Map
	for rows.Next() {
		var docID int
		var docIdStr string
		var docType, summary *string
		var dateEarliest, dateLatest *string

		if err := rows.Scan(&docID, &docIdStr, &docType, &summary, &dateEarliest, &dateLatest); err != nil {
			continue
		}

		documents = append(documents, fiber.Map{
			"id":           docID,
			"docId":        docIdStr,
			"documentType": docType,
			"summary":      summary,
			"dateEarliest": dateEarliest,
			"dateLatest":   dateLatest,
		})
	}

	return c.JSON(fiber.Map{
		"documents": documents,
		"count":     len(documents),
	})
}
