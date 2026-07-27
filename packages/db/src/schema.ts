import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  index,
  serial,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ─── Better Auth tables ─── */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  role: text("role").default("user"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/* ─── Location data ─── */

export const visits = pgTable(
  "visits",
  {
    id: serial("id").primaryKey(),
    start: text("start").notNull(),
    end: text("end").notNull(),
    date: text("date").notNull(),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    cluster: text("cluster").notNull(),
    semanticType: text("semantic_type").notNull(),
    placeId: text("place_id"),
    durationMinutes: real("duration_minutes").notNull(),
  },
  (t) => [
    index("visits_date_idx").on(t.date),
    index("visits_place_id_idx").on(t.placeId),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    start: text("start").notNull(),
    end: text("end").notNull(),
    date: text("date").notNull(),
    startLat: real("start_lat").notNull(),
    startLon: real("start_lon").notNull(),
    endLat: real("end_lat").notNull(),
    endLon: real("end_lon").notNull(),
    mode: text("mode").notNull(),
    distanceMeters: real("distance_meters").notNull(),
    durationMinutes: real("duration_minutes").notNull(),
  },
  (t) => [index("activities_date_idx").on(t.date), index("activities_mode_idx").on(t.mode)],
);

export const dayStats = pgTable("day_stats", {
  date: text("date").primaryKey(),
  totalDistanceMiles: real("total_distance_miles").notNull(),
  modes: jsonb("modes").$type<Record<string, number>>().notNull(),
  clusters: jsonb("clusters").$type<string[]>().notNull(),
  visitCount: integer("visit_count").notNull(),
  activityCount: integer("activity_count").notNull(),
});

export const analyticsCache = pgTable("analytics_cache", {
  key: text("key").primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const routeCache = pgTable("route_cache", {
  key: text("key").primaryKey(),
  geometry: jsonb("geometry").$type<[number, number][]>().notNull(),
  steps: jsonb("steps").$type<RouteStep[]>().notNull().default([]),
});

export const placeCache = pgTable(
  "place_cache",
  {
    placeId: text("place_id").primaryKey(),
    name: text("name").notNull(),
    address: text("address").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [uniqueIndex("place_cache_place_id_uidx").on(t.placeId)],
);

export type RouteStep = {
  name: string;
  distance_meters: number;
  duration_seconds: number;
  direction: string;
  geometry: [number, number][];
};

export type VisitRow = typeof visits.$inferSelect;
export type ActivityRow = typeof activities.$inferSelect;
export type DayStatsRow = typeof dayStats.$inferSelect;
