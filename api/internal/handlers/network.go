package handlers

import (
	"context"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/subculture-collective/epstein-db/api/internal/db"
)

// GetNetwork returns the relationship network for visualization
func GetNetwork(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	limitStr := c.Query("limit", "1000")
	limit, _ := strconv.Atoi(limitStr)
	if limit > 10000 {
		limit = 10000
	}

	minConnections := c.Query("minConnections", "2")
	minConn, _ := strconv.Atoi(minConnections)

	// Get nodes (entities with sufficient connections)
	nodeRows, err := pool.Query(ctx, `
		SELECT id, canonical_name, entity_type, layer, document_count, connection_count
		FROM entities
		WHERE entity_type IN ('person', 'organization')
		  AND connection_count >= $1
		ORDER BY connection_count DESC
		LIMIT $2
	`, minConn, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer nodeRows.Close()

	var nodes []fiber.Map
	nodeIDs := make(map[int]bool)
	
	for nodeRows.Next() {
		var id int
		var name, etype string
		var layer, docCount, connCount *int

		if err := nodeRows.Scan(&id, &name, &etype, &layer, &docCount, &connCount); err != nil {
			continue
		}

		nodeIDs[id] = true
		nodes = append(nodes, fiber.Map{
			"id":              id,
			"canonicalName":   name,
			"entityType":      etype,
			"layer":           layer,
			"documentCount":   docCount,
			"connectionCount": connCount,
		})
	}

	// Get edges (co-occurrence relationships)
	edgeRows, err := pool.Query(ctx, `
		SELECT 
			de1.entity_id AS source,
			de2.entity_id AS target,
			COUNT(DISTINCT de1.document_id) AS weight
		FROM document_entities de1
		JOIN document_entities de2 ON de1.document_id = de2.document_id 
			AND de1.entity_id < de2.entity_id
		JOIN entities e1 ON de1.entity_id = e1.id
		JOIN entities e2 ON de2.entity_id = e2.id
		WHERE e1.entity_type IN ('person', 'organization')
		  AND e2.entity_type IN ('person', 'organization')
		  AND e1.connection_count >= $1
		  AND e2.connection_count >= $1
		GROUP BY de1.entity_id, de2.entity_id
		HAVING COUNT(DISTINCT de1.document_id) >= 2
		ORDER BY weight DESC
		LIMIT $2
	`, minConn, limit*3)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer edgeRows.Close()

	var edges []fiber.Map
	for edgeRows.Next() {
		var source, target, weight int
		if err := edgeRows.Scan(&source, &target, &weight); err != nil {
			continue
		}

		// Only include edges where both nodes are in our node set
		if nodeIDs[source] && nodeIDs[target] {
			edges = append(edges, fiber.Map{
				"source": source,
				"target": target,
				"weight": weight,
			})
		}
	}

	return c.JSON(fiber.Map{
		"nodes": nodes,
		"edges": edges,
		"stats": fiber.Map{
			"nodeCount": len(nodes),
			"edgeCount": len(edges),
		},
	})
}

// GetNetworkByLayer returns entities organized by layer
func GetNetworkByLayer(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	var layers []fiber.Map

	for layer := 0; layer <= 3; layer++ {
		rows, err := pool.Query(ctx, `
			SELECT id, canonical_name, entity_type, document_count, connection_count
			FROM entities
			WHERE layer = $1 AND entity_type IN ('person', 'organization')
			ORDER BY connection_count DESC
			LIMIT 100
		`, layer)
		if err != nil {
			continue
		}

		var entities []fiber.Map
		for rows.Next() {
			var id int
			var name, etype string
			var docCount, connCount *int

			if err := rows.Scan(&id, &name, &etype, &docCount, &connCount); err != nil {
				continue
			}

			entities = append(entities, fiber.Map{
				"id":              id,
				"canonicalName":   name,
				"entityType":      etype,
				"documentCount":   docCount,
				"connectionCount": connCount,
			})
		}
		rows.Close()

		layers = append(layers, fiber.Map{
			"layer":    layer,
			"entities": entities,
			"count":    len(entities),
		})
	}

	return c.JSON(fiber.Map{
		"layers": layers,
	})
}

// ListPatterns returns discovered patterns
func ListPatterns(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	status := c.Query("status", "")
	patternType := c.Query("type", "")

	rows, err := pool.Query(ctx, `
		SELECT id, title, description, pattern_type, confidence, status, discovered_at
		FROM pattern_findings
		WHERE ($1 = '' OR status = $1)
		  AND ($2 = '' OR pattern_type = $2)
		ORDER BY discovered_at DESC
		LIMIT 100
	`, status, patternType)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var patterns []fiber.Map
	for rows.Next() {
		var id int
		var title, description, ptype, status string
		var confidence *float64
		var discoveredAt string

		if err := rows.Scan(&id, &title, &description, &ptype, &confidence, &status, &discoveredAt); err != nil {
			continue
		}

		patterns = append(patterns, fiber.Map{
			"id":           id,
			"title":        title,
			"description":  description,
			"patternType":  ptype,
			"confidence":   confidence,
			"status":       status,
			"discoveredAt": discoveredAt,
		})
	}

	return c.JSON(fiber.Map{
		"patterns": patterns,
		"count":    len(patterns),
	})
}

// GetPattern returns a single pattern with full details
func GetPattern(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid id"})
	}

	var pattern struct {
		ID           int     `json:"id"`
		Title        string  `json:"title"`
		Description  string  `json:"description"`
		PatternType  string  `json:"patternType"`
		EntityIDs    []int   `json:"entityIds"`
		Evidence     []byte  `json:"evidence"`
		Confidence   *float64 `json:"confidence"`
		Status       string  `json:"status"`
		Notes        *string `json:"notes"`
		DiscoveredAt string  `json:"discoveredAt"`
		DiscoveredBy string  `json:"discoveredBy"`
	}

	err = pool.QueryRow(ctx, `
		SELECT id, title, description, pattern_type, entity_ids, evidence,
			   confidence, status, notes, discovered_at, discovered_by
		FROM pattern_findings WHERE id = $1
	`, id).Scan(
		&pattern.ID, &pattern.Title, &pattern.Description, &pattern.PatternType,
		&pattern.EntityIDs, &pattern.Evidence, &pattern.Confidence,
		&pattern.Status, &pattern.Notes, &pattern.DiscoveredAt, &pattern.DiscoveredBy,
	)

	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "pattern not found"})
	}

	// Get entity details
	entityRows, err := pool.Query(ctx, `
		SELECT id, canonical_name, entity_type, layer
		FROM entities WHERE id = ANY($1)
	`, pattern.EntityIDs)
	if err == nil {
		var entities []fiber.Map
		for entityRows.Next() {
			var eid int
			var name, etype string
			var layer *int
			if err := entityRows.Scan(&eid, &name, &etype, &layer); err != nil {
				continue
			}
			entities = append(entities, fiber.Map{
				"id":            eid,
				"canonicalName": name,
				"entityType":    etype,
				"layer":         layer,
			})
		}
		entityRows.Close()

		return c.JSON(fiber.Map{
			"pattern":  pattern,
			"entities": entities,
		})
	}

	return c.JSON(pattern)
}
