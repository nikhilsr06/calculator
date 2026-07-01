// import { Pool } from "pg";

// export const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
// });

// pool.on("error", (err) => {
//   // Unexpected errors on idle clients - log, don't crash the whole process
//   console.error("Unexpected Postgres pool error", err);
// });


import { config } from "dotenv";
config(); // ALWAYS FIRST

import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true"
    ? { rejectUnauthorized: false }
    : undefined,
});