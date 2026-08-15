export type Env = {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ASSETS: Fetcher;
  UPLOADS: R2Bucket;
  IMPORT_QUEUE?: Queue;
  DISABLE_SIGNUP?: string;
  CSP_ENFORCE?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  DEMO_EMAIL?: string;
  DEMO_PASSWORD?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_MONTHLY?: string;
  STRIPE_PRICE_YEARLY?: string;
  GRACE_DAYS?: string;
  MAP_TILE_DARK_URL?: string;
  MAP_TILE_LIGHT_URL?: string;
  MAP_STYLE_DARK_URL?: string;
  MAP_STYLE_LIGHT_URL?: string;
  MAP_CUSTOM_TILE_HOSTS?: string;
  OSRM_BASE?: string;
  GEOCODE_BASE?: string;
  MAP_TILE_ATTR?: string;
  GLOBE_ENABLED?: string;
  DEMO_TOUR?: string;
  LANDING_ENABLED?: string;
};

export function googleAuthEnabled(env: Pick<Env, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET">): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}

export type ImportQueueMessage = {
  kind?: "import";
  jobId: string;
  tenant: string;
  userId: string;
  r2Key: string;
  sourceId: string;
  merge?: boolean;
  skipOverlappingDays?: boolean;
};
