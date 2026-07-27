import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config();
const sql = neon(process.env.DATABASE_URL);
const r = await sql`select tenant, count(*)::int as n from visits group by tenant order by tenant`;
console.log(r);
