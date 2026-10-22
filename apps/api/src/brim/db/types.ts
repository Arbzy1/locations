import type { Db } from "@locations/db";
import type { Env } from "../../env";

/** Request-scoped handle: Worker env plus the Pool-backed Drizzle client. */
export type BrimDb = {
  env: Env;
  db: Db;
};
