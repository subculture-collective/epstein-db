import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  // Database
  DATABASE_URL: z.string().default('postgresql://epstein:epstein_dev@localhost:5432/epstein'),
  NEO4J_URI: z.string().default('bolt://localhost:7687'),
  NEO4J_USER: z.string().default('neo4j'),
  NEO4J_PASSWORD: z.string().default('neo4j_dev'),
  TYPESENSE_HOST: z.string().default('localhost'),
  TYPESENSE_PORT: z.coerce.number().default(8108),
  TYPESENSE_API_KEY: z.string().default('typesense_dev'),

  // LLM
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('claude-sonnet-4-20250514'),
  
  // Extraction
  DATA_DIR: z.string().default('../DataSources'),
  BATCH_SIZE: z.coerce.number().default(10),
  MAX_WORKERS: z.coerce.number().default(5),
  
  // Rate limiting
  REQUESTS_PER_MINUTE: z.coerce.number().default(50),
});

export type Config = z.infer<typeof configSchema>;

export const config = configSchema.parse(process.env);
