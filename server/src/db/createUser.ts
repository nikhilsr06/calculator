/**
 * One-off CLI to create a user account (employee or administrator).
 * Useful for bootstrapping before any admin UI users exist, or for
 * scripted/bulk account creation.
 *
 * Usage:
 *   npx tsx src/db/createUser.ts employee@company.com "StrongPassword123!" employee
 *   npx tsx src/db/createUser.ts admin@company.com "StrongPassword123!" administrator
 *
 * Role defaults to "employee" if omitted.
 */
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { pool } from "./pool";

dotenv.config();

async function main() {
  const [, , email, password, roleArg] = process.argv;
  const role = roleArg === "administrator" ? "administrator" : "employee";

  if (!email || !password) {
    console.error('Usage: npx tsx src/db/createUser.ts <email> "<password>" [employee|administrator]');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await pool.query(
    `insert into users (email, password_hash, role)
     values ($1, $2, $3)
     on conflict (email) do update set password_hash = excluded.password_hash, role = excluded.role
     returning id, email, role`,
    [email.toLowerCase(), passwordHash, role]
  );

  console.log("User account ready:", result.rows[0]);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
