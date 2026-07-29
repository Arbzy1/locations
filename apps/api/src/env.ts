export type Env = {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  ASSETS: Fetcher;
  UPLOADS: R2Bucket;
};
