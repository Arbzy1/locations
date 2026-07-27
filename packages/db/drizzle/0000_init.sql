CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "email_verified" boolean DEFAULT false NOT NULL,
  "image" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "role" text DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamp NOT NULL,
  "token" text NOT NULL UNIQUE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "password" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "visits" (
  "id" serial PRIMARY KEY NOT NULL,
  "start" text NOT NULL,
  "end" text NOT NULL,
  "date" text NOT NULL,
  "lat" real NOT NULL,
  "lon" real NOT NULL,
  "cluster" text NOT NULL,
  "semantic_type" text NOT NULL,
  "place_id" text,
  "duration_minutes" real NOT NULL
);

CREATE TABLE IF NOT EXISTS "activities" (
  "id" serial PRIMARY KEY NOT NULL,
  "start" text NOT NULL,
  "end" text NOT NULL,
  "date" text NOT NULL,
  "start_lat" real NOT NULL,
  "start_lon" real NOT NULL,
  "end_lat" real NOT NULL,
  "end_lon" real NOT NULL,
  "mode" text NOT NULL,
  "distance_meters" real NOT NULL,
  "duration_minutes" real NOT NULL
);

CREATE TABLE IF NOT EXISTS "day_stats" (
  "date" text PRIMARY KEY NOT NULL,
  "total_distance_miles" real NOT NULL,
  "modes" jsonb NOT NULL,
  "clusters" jsonb NOT NULL,
  "visit_count" integer NOT NULL,
  "activity_count" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "analytics_cache" (
  "key" text PRIMARY KEY NOT NULL,
  "data" jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "route_cache" (
  "key" text PRIMARY KEY NOT NULL,
  "geometry" jsonb NOT NULL,
  "steps" jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "place_cache" (
  "place_id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "address" text NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" ("user_id");
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" ("user_id");
CREATE INDEX IF NOT EXISTS "visits_date_idx" ON "visits" ("date");
CREATE INDEX IF NOT EXISTS "visits_place_id_idx" ON "visits" ("place_id");
CREATE INDEX IF NOT EXISTS "activities_date_idx" ON "activities" ("date");
CREATE INDEX IF NOT EXISTS "activities_mode_idx" ON "activities" ("mode");
CREATE UNIQUE INDEX IF NOT EXISTS "place_cache_place_id_uidx" ON "place_cache" ("place_id");
