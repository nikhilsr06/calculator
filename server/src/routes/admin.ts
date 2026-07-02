import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateFormula } from "../services/formulaEngine";
import { syncFormulaInputs } from "../services/syncFormulaInputs";

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
  category_id: z.string().uuid().nullable().optional(),
  result_unit: z.string().optional(),
  inputs: z
    .array(
      z.object({
        name: z.string().min(1),
        label: z.string().min(1),
        type: z.enum(["number", "text"]).default("number"),
        required: z.boolean().default(true),
        display_order: z.number().int().default(0),
        unit: z.string().optional(),
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
  const { name, description, category_id, result_unit, inputs, expression, publish } = parsed.data;
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

    const orderResult = await client.query(
      `select coalesce(max(display_order), -1) as m from calculators where category_id is not distinct from $1`,
      [category_id ?? null]
    );
    const nextOrder = Number(orderResult.rows[0].m) + 1;

    const calcResult = await client.query(
      `insert into calculators (name, description, category_id, display_order, result_unit, created_by)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [name, description ?? null, category_id ?? null, nextOrder, result_unit ?? null, adminId]
    );
    const calculator = calcResult.rows[0];

    for (const input of inputs) {
      await client.query(
        `insert into formula_inputs (calculator_id, name, label, type, required, display_order, unit)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          calculator.id,
          input.name,
          input.label,
          input.type,
          input.required,
          input.display_order,
          input.unit ?? null,
        ]
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
  const result = await pool.query(
    `select c.*, cat.name as category_name
     from calculators c
     left join categories cat on cat.id = c.category_id
     order by c.category_id nulls last, c.display_order asc, c.created_at desc`
  );
  res.json({ calculators: result.rows });
});

router.get("/calculators/:id", async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    `select c.*, cat.name as category_name
     from calculators c
     left join categories cat on cat.id = c.category_id
     where c.id = $1`,
    [id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Calculator not found" });
  }
  res.json({ calculator: result.rows[0] });
});

router.get("/calculators/:id/inputs", async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query("begin");

    const versionResult = await client.query(
      `select expression from formula_versions where calculator_id = $1 and active = true`,
      [id]
    );
    if (versionResult.rowCount && versionResult.rowCount > 0) {
      await syncFormulaInputs(client, id, versionResult.rows[0].expression as string);
    }

    const result = await client.query(
      `select id, name, label, type, required, display_order, unit
       from formula_inputs
       where calculator_id = $1
       order by display_order asc`,
      [id]
    );

    await client.query("commit");
    res.json({ inputs: result.rows });
  } catch (err) {
    await client.query("rollback");
    res.status(500).json({ error: "Failed to load inputs" });
  } finally {
    client.release();
  }
});

const updateInputsSchema = z.object({
  inputs: z.array(
    z.object({
      id: z.string().uuid(),
      label: z.string().min(1).optional(),
      unit: z.string().optional(),
    })
  ),
});

router.put("/calculators/:id/inputs", async (req, res) => {
  const parsed = updateInputsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { id } = req.params;
  const adminId = req.user!.sub;

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const input of parsed.data.inputs) {
      const sets: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      if (input.label !== undefined) {
        sets.push(`label = $${i++}`);
        values.push(input.label);
      }
      if (input.unit !== undefined) {
        sets.push(`unit = $${i++}`);
        values.push(input.unit || null);
      }
      if (sets.length === 0) continue;
      values.push(input.id, id);
      await client.query(
        `update formula_inputs set ${sets.join(", ")} where id = $${i++} and calculator_id = $${i}`,
        values
      );
    }
    await client.query("commit");
    await writeAuditLog(adminId, "UPDATE_CALCULATOR", "calculator", id);
    const result = await pool.query(
      `select id, name, label, type, required, display_order, unit
       from formula_inputs where calculator_id = $1 order by display_order asc`,
      [id]
    );
    res.json({ inputs: result.rows });
  } catch (err) {
    await client.query("rollback");
    res.status(500).json({ error: "Failed to update inputs" });
  } finally {
    client.release();
  }
});

const updateCalculatorSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  active: z.boolean().optional(),
  category_id: z.string().uuid().nullable().optional(),
  result_unit: z.string().optional(),
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

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`delete from calculation_logs where calculator_id = $1`, [id]);
    const result = await client.query(`delete from calculators where id = $1 returning id`, [id]);
    if (result.rowCount === 0) {
      await client.query("rollback");
      return res.status(404).json({ error: "Calculator not found" });
    }
    await client.query("commit");
    await writeAuditLog(adminId, "DELETE_CALCULATOR", "calculator", id);
    res.status(204).send();
  } catch (err) {
    await client.query("rollback");
    res.status(500).json({ error: "Failed to delete calculator" });
  } finally {
    client.release();
  }
});

const reorderCalculatorsSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  orderedIds: z.array(z.string().uuid()),
});

/**
 * Persists the display order (and category) for a whole bucket of calculators
 * in one shot - called after a drag-and-drop reorder or a move between
 * categories on the admin dashboard.
 */
router.post("/calculators/reorder", async (req, res) => {
  const parsed = reorderCalculatorsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { categoryId, orderedIds } = parsed.data;
  const adminId = req.user!.sub;

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        `update calculators set category_id = $1, display_order = $2, updated_at = now() where id = $3`,
        [categoryId, i, orderedIds[i]]
      );
    }
    await client.query("commit");
    await writeAuditLog(adminId, "REORDER_CALCULATORS", "calculator", categoryId);
    res.json({ ok: true });
  } catch (err) {
    await client.query("rollback");
    res.status(500).json({ error: "Failed to reorder calculators" });
  } finally {
    client.release();
  }
});

// ============================================================
// Categories
// ============================================================

router.get("/categories", async (req, res) => {
  const result = await pool.query(`select * from categories order by display_order asc, name asc`);
  res.json({ categories: result.rows });
});

const categorySchema = z.object({ name: z.string().min(1) });

router.post("/categories", async (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const adminId = req.user!.sub;

  const orderResult = await pool.query(`select coalesce(max(display_order), -1) as m from categories`);
  const nextOrder = Number(orderResult.rows[0].m) + 1;

  const result = await pool.query(
    `insert into categories (name, display_order) values ($1, $2) returning *`,
    [parsed.data.name, nextOrder]
  );
  await writeAuditLog(adminId, "CREATE_CATEGORY", "category", result.rows[0].id);
  res.status(201).json({ category: result.rows[0] });
});

router.put("/categories/:id", async (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { id } = req.params;
  const adminId = req.user!.sub;

  const result = await pool.query(
    `update categories set name = $1, updated_at = now() where id = $2 returning *`,
    [parsed.data.name, id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Category not found" });
  }
  await writeAuditLog(adminId, "UPDATE_CATEGORY", "category", id);
  res.json({ category: result.rows[0] });
});

router.delete("/categories/:id", async (req, res) => {
  const { id } = req.params;
  const adminId = req.user!.sub;
  // Calculators inside fall back to "Uncategorized" via ON DELETE SET NULL.
  const result = await pool.query(`delete from categories where id = $1 returning id`, [id]);
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Category not found" });
  }
  await writeAuditLog(adminId, "DELETE_CATEGORY", "category", id);
  res.status(204).send();
});

const reorderCategoriesSchema = z.object({ orderedIds: z.array(z.string().uuid()) });

router.post("/categories/reorder", async (req, res) => {
  const parsed = reorderCategoriesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const adminId = req.user!.sub;

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (let i = 0; i < parsed.data.orderedIds.length; i++) {
      await client.query(`update categories set display_order = $1, updated_at = now() where id = $2`, [
        i,
        parsed.data.orderedIds[i],
      ]);
    }
    await client.query("commit");
    await writeAuditLog(adminId, "REORDER_CATEGORIES", "category", null);
    res.json({ ok: true });
  } catch (err) {
    await client.query("rollback");
    res.status(500).json({ error: "Failed to reorder categories" });
  } finally {
    client.release();
  }
});

// ============================================================
// Formulas / versions
// ============================================================

const validateExpressionSchema = z.object({ expression: z.string() });

/**
 * Parses an expression and returns the variable names it references, without
 * saving anything. Powers the "extract variables from expression" step of
 * the calculator-creation wizard.
 */
router.post("/formulas/validate", (req, res) => {
  const parsed = validateExpressionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const result = validateFormula(parsed.data.expression);
  res.json(result);
});

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

    if (publish) {
      await syncFormulaInputs(client, calculatorId, expression);
    }

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

    const expression =
      parsed.data.expression ?? (existing.rows[0].expression as string);
    if (parsed.data.active === true) {
      await syncFormulaInputs(client, calculatorId, expression);
    }

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

  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query(`delete from calculation_logs where user_id = $1`, [id]);
    await client.query(`delete from audit_logs where admin_id = $1`, [id]);
    await client.query(`update calculators set created_by = null where created_by = $1`, [id]);
    await client.query(`update formula_versions set created_by = null where created_by = $1`, [id]);

    const result = await client.query(`delete from users where id = $1 returning id`, [id]);
    if (result.rowCount === 0) {
      await client.query("rollback");
      return res.status(404).json({ error: "User not found" });
    }

    await client.query("commit");
    res.status(204).send();
  } catch (err) {
    await client.query("rollback");
    res.status(500).json({ error: "Failed to delete user" });
  } finally {
    client.release();
  }
});

export default router;
