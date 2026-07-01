import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../db/pool";
import { signToken } from "../utils/jwt";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  const { email, password } = parsed.data;

  const result = await pool.query(
    "select id, email, password_hash, role from users where email = $1",
    [email.toLowerCase()]
  );

  // Use a generic error message so we don't leak whether the email exists.
  const genericError = { error: "Invalid email or password" };

  if (result.rowCount === 0) {
    return res.status(401).json(genericError);
  }

  const user = result.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json(genericError);
  }

  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role },
  });
});

export default router;
