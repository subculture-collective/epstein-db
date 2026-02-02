package db

import (
	"context"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

var pool *pgxpool.Pool

func Initialize(ctx context.Context) error {
	connString := os.Getenv("DATABASE_URL")
	if connString == "" {
		connString = "postgresql://epstein:epstein_dev@localhost:5432/epstein"
	}

	var err error
	pool, err = pgxpool.New(ctx, connString)
	if err != nil {
		return err
	}

	return pool.Ping(ctx)
}

func Close() {
	if pool != nil {
		pool.Close()
	}
}

func Pool() *pgxpool.Pool {
	return pool
}
