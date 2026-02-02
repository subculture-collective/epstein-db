package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/joho/godotenv"

	"github.com/subculture-collective/epstein-db/api/internal/db"
	"github.com/subculture-collective/epstein-db/api/internal/handlers"
)

func main() {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// Initialize database connection
	if err := db.Initialize(context.Background()); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Create Fiber app
	app := fiber.New(fiber.Config{
		AppName: "Epstein Files API",
	})

	// Middleware
	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
	}))

	// Routes
	api := app.Group("/api")

	// Stats
	api.Get("/stats", handlers.GetStats)

	// Entities
	api.Get("/entities", handlers.SearchEntities)
	api.Get("/entities/:id", handlers.GetEntity)
	api.Get("/entities/:id/connections", handlers.GetEntityConnections)
	api.Get("/entities/:id/documents", handlers.GetEntityDocuments)

	// Documents
	api.Get("/documents", handlers.ListDocuments)
	api.Get("/documents/:id", handlers.GetDocument)
	api.Get("/documents/:id/text", handlers.GetDocumentText)
	api.Get("/documents/:id/entities", handlers.GetDocumentEntities)

	// Graph/Network
	api.Get("/network", handlers.GetNetwork)
	api.Get("/network/layers", handlers.GetNetworkByLayer)

	// Cross-references
	api.Get("/crossref/ppp", handlers.SearchPPP)
	api.Get("/crossref/fec", handlers.SearchFEC)
	api.Get("/crossref/grants", handlers.SearchGrants)

	// Patterns
	api.Get("/patterns", handlers.ListPatterns)
	api.Get("/patterns/:id", handlers.GetPattern)

	// Search
	api.Get("/search", handlers.FullTextSearch)

	// Health check
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// Get port from environment
	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("Shutting down...")
		app.Shutdown()
	}()

	// Start server
	log.Printf("Starting server on port %s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
