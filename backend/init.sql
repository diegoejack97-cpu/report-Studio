-- Report Studio — PostgreSQL initialization
-- This runs only on first container start (empty volume)

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- fast text search
CREATE EXTENSION IF NOT EXISTS unaccent;    -- accent-insensitive search

-- Note: Tables are created by SQLAlchemy on startup via metadata.create_all()
-- This file handles DB-level extensions and any seed data

-- Seed: nothing required — users register via the app
