/**
 * One-off script to create an administrator account, since the system
 * intentionally has no public registration endpoint (spec: only
 * authorized administrators may manage formulas, and admin/employee auth
 * are fully separate).
 *
 * Usage:
 *   npx tsx src/db/seedAdmin.ts admin@company.com "StrongPassword123!"
 */
// import dotenv from "dotenv";
// import bcrypt from "bcryptjs";
// import { pool } from "./pool";

// dotenv.config();


import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "./pool";



async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error('Usage: npx tsx src/db/seedAdmin.ts <email> "<password>"');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await pool.query(
    `insert into users (email, password_hash, role)
     values ($1, $2, 'administrator')
     on conflict (email) do update set password_hash = excluded.password_hash, role = 'administrator'
     returning id, email, role`,
    [email.toLowerCase(), passwordHash]
  );

  console.log("Administrator account ready:", result.rows[0]);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
