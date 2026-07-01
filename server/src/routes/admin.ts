import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateFormula } from "../services/formulaEngine";

const router = Router();
router.use(requireAuth, requireRole("administrator"));

async function writeAuditLog(
  adminId: string,
  action: string,
  resourceType: string,
  resourceId: string | null
) {
  await pool.query(
    `insert into audit_logs (admin_id, action, resource_type, resource_id) values ($1, $2, $3, $4)`,
    [adminId, action, resourceType, resourceId]
  );
}

// ============================================================
// Calculators
// ============================================================

const createCalculatorSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  inputs: z
    .array(
      z.object({
        name: z.string().min(1),
        label: z.string().min(1),
        type: z.enum(["number", "text"]).default("number"),
        required: z.boolean().default(true),
        display_order: z.number().int().default(0),
      })
    )
    .default([]),
  // Optional: supply a formula expression up-front and publish in one shot.
  expression: z.string().optional(),
  publish: z.boolean().default(false),
});

router.post("/calculators", async (req, res) => {
  const parsed = createCalculatorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, description, inputs, expression, publish } = parsed.data;
  const adminId = req.user!.sub;

  // Validate the formula before opening a transaction so we fail fast.
  if (expression) {
    const validation = validateFormula(expression);
    if (!validation.valid) {
      return res.status(422).json({ error: validation.error });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const calcResult = await client.query(
      `insert into calculators (name, description, created_by) values ($1, $2, $3) returning *`,
      [name, description ?? null, adminId]
    );
    const calculator = calcResult.rows[0];

    for (const input of inputs) {
      await client.query(
        `insert into formula_inputs (calculator_id, name, label, type, required, display_order)
         values ($1, $2, $3, $4, $5, $6)`,
        [calculator.id, input.name, input.label, input.type, input.required, input.display_order]
      );
    }

    let formulaVersion = null;
    if (expression) {
      const fvResult = await client.query(
        `insert into formula_versions (calculator_id, expression, version_number, active, created_by)
         values ($1, $2, 1, $3, $4)
         returning id, version_number, active, created_at`,
        [calculator.id, expression, publish, adminId]
      );
      formulaVersion = fvResult.rows[0];
    }

    await client.query("commit");

    await writeAuditLog(adminId, "CREATE_CALCULATOR", "calculator", calculator.id);
    if (formulaVersion) {
      await writeAuditLog(adminId, "CREATE_FORMULA", "formula_version", formulaVersion.id);
      if (publish) {
        await writeAuditLog(adminId, "PUBLISH_FORMULA", "formula_version", formulaVersion.id);
      }
    }

    res.status(201).json({ calculator, formulaVersion });
  } catch (err) {
    await client.query("rollback");
    res.status(500).json({ error: "Failed to create calculator" });
  } finally {
    client.release();
  }
});

router.get("/calculators", async (req, res) => {
  const result = await pool.query(`select * from calculators order by created_at desc`);
  res.json({ calculators: result.rows });
});

const updateCalculatorSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  active: z.boolean().optional(),
});

router.put("/calculators/:id", async (req, res) => {
  const parsed = updateCalculatorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { id } = req.params;
  const fields = parsed.data;
  const adminId = req.user!.sub;

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = $${i++}`);
    values.push(value);
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }
  sets.push(`updated_at = now()`);
  values.push(id);

  const result = await pool.query(
    `update calculators set ${sets.join(", ")} where id = $${i} returning *`,
    values
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Calculator not found" });
  }

  await writeAuditLog(adminId, "UPDATE_CALCULATOR", "calculator", id);
  res.json({ calculator: result.rows[0] });
});

router.delete("/calculators/:id", async (req, res) => {
  const { id } = req.params;
  const adminId = req.user!.sub;
  const result = await pool.query(`delete from calculators where id = $1 returning id`, [id]);
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Calculator not found" });
  }
  await writeAuditLog(adminId, "DELETE_CALCULATOR", "calculator", id);
  res.status(204).send();
});

// ============================================================
// Formulas / versions
// ============================================================

const createFormulaSchema = z.object({
  calculatorId: z.string().uuid(),
  expression: z.string().min(1),
  publish: z.boolean().default(false),
});

router.post("/formulas", async (req, res) => {
  const parsed = createFormulaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { calculatorId, expression, publish } = parsed.data;
  const adminId = req.user!.sub;

  const validation = validateFormula(expression);
  if (!validation.valid) {
    return res.status(422).json({ error: validation.error });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const maxVersionResult = await client.query(
      `select coalesce(max(version_number), 0) as max_version
       from formula_versions where calculator_id = $1`,
      [calculatorId]
    );
    const nextVersion = Number(maxVersionResult.rows[0].max_version) + 1;

    if (publish) {
      await client.query(
        `update formula_versions set active = false where calculator_id = $1 and active = true`,
        [calculatorId]
      );
    }

    const insertResult = await client.query(
      `insert into formula_versions (calculator_id, expression, version_number, active, created_by)
       values ($1, $2, $3, $4, $5) returning id, calculator_id, version_number, active, created_at`,
      [calculatorId, expression, nextVersion, publish, adminId]
    );

    await client.query("commit");

    await writeAuditLog(adminId, "CREATE_FORMULA", "formula_version", insertResult.rows[0].id);
    if (publish) {
      await writeAuditLog(adminId, "PUBLISH_FORMULA", "formula_version", insertResult.rows[0].id);
    }

    // Response intentionally omits `expression` is NOT needed here since this
    // IS the admin endpoint - admins are allowed to see formulas they manage.
    res.status(201).json({ formulaVersion: { ...insertResult.rows[0], expression } });
  } catch (err) {
    await client.query("rollback");
    res.status(500).json({ error: "Failed to create formula version" });
  } finally {
    client.release();
  }
});

// List formula versions for a calculator (admin only - includes expression text)
router.get("/calculators/:id/formulas", async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    `select id, calculator_id, expression, version_number, active, created_at, updated_at
     from formula_versions
     where calculator_id = $1
     order by version_number desc`,
    [id]
  );
  res.json({ formulaVersions: result.rows });
});

const updateFormulaSchema = z.object({
  expression: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

router.put("/formulas/:id", async (req, res) => {
  const parsed = updateFormulaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { id } = req.params;
  const adminId = req.user!.sub;

  if (parsed.data.expression) {
    const validation = validateFormula(parsed.data.expression);
    if (!validation.valid) {
      return res.status(422).json({ error: validation.error });
    }
  }

  const existing = await pool.query(`select * from formula_versions where id = $1`, [id]);
  if (existing.rowCount === 0) {
    return res.status(404).json({ error: "Formula version not found" });
  }
  const calculatorId = existing.rows[0].calculator_id;

  const client = await pool.connect();
  try {
    await client.query("begin");

    if (parsed.data.active === true) {
      await client.query(
        `update formula_versions set active = false where calculator_id = $1 and active = true and id != $2`,
        [calculatorId, id]
      );
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [key, value] of Object.entries(parsed.data)) {
      sets.push(`${key} = $${i++}`);
      values.push(value);
    }
    sets.push(`updated_at = now()`);
    values.push(id);

    const result = await client.query(
      `update formula_versions set ${sets.join(", ")} where id = $${i} returning *`,
      values
    );

    await client.query("commit");

    await writeAuditLog(adminId, "UPDATE_FORMULA", "formula_version", id);
    if (parsed.data.active === true) {
      await writeAuditLog(adminId, "PUBLISH_FORMULA", "formula_version", id);
    } else if (parsed.data.active === false) {
      await writeAuditLog(adminId, "DISABLE_FORMULA", "formula_version", id);
    }

    res.json({ formulaVersion: result.rows[0] });
  } catch (err) {
    await client.query("rollback");
    res.status(500).json({ error: "Failed to update formula version" });
  } finally {
    client.release();
  }
});

router.delete("/formulas/:id", async (req, res) => {
  const { id } = req.params;
  const adminId = req.user!.sub;
  const result = await pool.query(`delete from formula_versions where id = $1 returning id`, [id]);
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Formula version not found" });
  }
  await writeAuditLog(adminId, "DELETE_FORMULA", "formula_version", id);
  res.status(204).send();
});

// ============================================================
// Logs
// ============================================================

router.get("/logs/calculations", async (req, res) => {
  const result = await pool.query(
    `select cl.*, u.email as user_email, c.name as calculator_name
     from calculation_logs cl
     join users u on u.id = cl.user_id
     join calculators c on c.id = cl.calculator_id
     order by cl.created_at desc
     limit 500`
  );
  res.json({ logs: result.rows });
});

router.get("/logs/audit", async (req, res) => {
  const result = await pool.query(
    `select al.*, u.email as admin_email
     from audit_logs al
     join users u on u.id = al.admin_id
     order by al.timestamp desc
     limit 500`
  );
  res.json({ logs: result.rows });
});

// ============================================================
// Users
// ============================================================

router.get("/users", async (req, res) => {
  const result = await pool.query(
    `select id, email, role, created_at, updated_at from users order by created_at desc`
  );
  res.json({ users: result.rows });
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["employee", "administrator"]).default("employee"),
});

router.post("/users", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password, role } = parsed.data;

  const existing = await pool.query(`select 1 from users where email = $1`, [email.toLowerCase()]);
  if ((existing.rowCount ?? 0) > 0) {
    return res.status(409).json({ error: "A user with this email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `insert into users (email, password_hash, role)
     values ($1, $2, $3)
     returning id, email, role, created_at, updated_at`,
    [email.toLowerCase(), passwordHash, role]
  );

  res.status(201).json({ user: result.rows[0] });
});

const updateUserSchema = z.object({
  role: z.enum(["employee", "administrator"]).optional(),
  password: z.string().min(8).optional(),
});

router.put("/users/:id", async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { id } = req.params;
  const { role, password } = parsed.data;

  if (!role && !password) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (role) {
    sets.push(`role = $${i++}`);
    values.push(role);
  }
  if (password) {
    sets.push(`password_hash = $${i++}`);
    values.push(await bcrypt.hash(password, 12));
  }
  sets.push(`updated_at = now()`);
  values.push(id);

  const result = await pool.query(
    `update users set ${sets.join(", ")} where id = $${i} returning id, email, role, created_at, updated_at`,
    values
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({ user: result.rows[0] });
});

router.delete("/users/:id", async (req, res) => {
  const { id } = req.params;
  const adminId = req.user!.sub;

  if (id === adminId) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }

  const result = await pool.query(`delete from users where id = $1 returning id`, [id]);
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "User not found" });
  }
  res.status(204).send();
});

export default router;
