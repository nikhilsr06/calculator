import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { evaluateFormula } from "../services/formulaEngine";
import { syncFormulaInputs } from "../services/syncFormulaInputs";

const router = Router();
router.use(requireAuth);

/**
 * List active calculators, grouped by category for display. Note: we SELECT
 * only id/name/description/result_unit - the formula expression column is
 * never touched by this query, so it cannot accidentally leak even if
 * someone changes the response shape later.
 */
router.get("/calculators", async (req, res) => {
  const categoriesResult = await pool.query(
    `select id, name, display_order from categories order by display_order asc, name asc`
  );
  const calculatorsResult = await pool.query(
    `select id, name, description, result_unit, category_id, display_order
     from calculators
     where active = true
     order by display_order asc, name asc`
  );

  const byCategory = new Map<string, typeof calculatorsResult.rows>();
  const uncategorized: typeof calculatorsResult.rows = [];
  for (const calc of calculatorsResult.rows) {
    if (calc.category_id) {
      const bucket = byCategory.get(calc.category_id) ?? [];
      bucket.push(calc);
      byCategory.set(calc.category_id, bucket);
    } else {
      uncategorized.push(calc);
    }
  }

  const categories = categoriesResult.rows
    .map((cat) => ({ ...cat, calculators: byCategory.get(cat.id) ?? [] }))
    .filter((cat) => cat.calculators.length > 0);

  res.json({ categories, uncategorized });
});

/**
 * Get a single calculator's input field definitions (NOT the formula).
 */
router.get("/calculators/:id", async (req, res) => {
  const { id } = req.params;

  const calcResult = await pool.query(
    `select id, name, description, result_unit from calculators where id = $1 and active = true`,
    [id]
  );
  if (calcResult.rowCount === 0) {
    return res.status(404).json({ error: "Calculator not found" });
  }

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

    const inputsResult = await client.query(
      `select id, name, label, type, required, display_order, unit
       from formula_inputs
       where calculator_id = $1
       order by display_order asc`,
      [id]
    );

    await client.query("commit");

    res.json({
      calculator: calcResult.rows[0],
      inputs: inputsResult.rows,
    });
  } catch (err) {
    await client.query("rollback");
    res.status(500).json({ error: "Failed to load calculator" });
  } finally {
    client.release();
  }
});

const calculateSchema = z.object({
  calculatorId: z.string().uuid(),
  inputs: z.record(z.union([z.number(), z.string()])),
});

/**
 * Executes a calculation server-side. The expression itself is fetched
 * from the DB, evaluated here, and ONLY the numeric result is returned -
 * the expression is never included in the response (spec section 4).
 */
router.post("/calculate", async (req, res) => {
  const parsed = calculateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  const { calculatorId, inputs } = parsed.data;
  const userId = req.user!.sub;

  const calcResult = await pool.query(
    `select id from calculators where id = $1 and active = true`,
    [calculatorId]
  );
  if (calcResult.rowCount === 0) {
    return res.status(404).json({ error: "Calculator not found" });
  }

  const versionResult = await pool.query(
    `select expression from formula_versions where calculator_id = $1 and active = true`,
    [calculatorId]
  );
  if (versionResult.rowCount === 0) {
    return res.status(409).json({ error: "No active formula version for this calculator" });
  }
  const expression: string = versionResult.rows[0].expression;

  const inputDefs = await pool.query(
    `select name, type, required from formula_inputs where calculator_id = $1`,
    [calculatorId]
  );

  // Validate required inputs are present and numeric, build evaluation scope.
  const scope: Record<string, number> = {};
  for (const def of inputDefs.rows) {
    const raw = inputs[def.name];
    if (raw === undefined || raw === null || raw === "") {
      if (def.required) {
        return res.status(400).json({ error: `Missing required input: ${def.name}` });
      }
      continue;
    }
    const num = typeof raw === "number" ? raw : Number(raw);
    if (Number.isNaN(num)) {
      return res.status(400).json({ error: `Input "${def.name}" must be a number` });
    }
    scope[def.name] = num;
  }

  let result: number;
  try {
    result = evaluateFormula(expression, scope);
  } catch (err) {
    // Do not leak the underlying expression or stack trace to the client.
    return res.status(422).json({ error: "Calculation could not be completed." });
  }

  await pool.query(
    `insert into calculation_logs (user_id, calculator_id, inputs, result)
     values ($1, $2, $3, $4)`,
    [userId, calculatorId, JSON.stringify(inputs), result]
  );

  res.json({ result });
});

/**
 * An employee's own calculation history (spec: optional feature).
 */
router.get("/history", async (req, res) => {
  const userId = req.user!.sub;
  const result = await pool.query(
    `select cl.id, cl.calculator_id, c.name as calculator_name, cl.inputs, cl.result, cl.created_at
     from calculation_logs cl
     join calculators c on c.id = cl.calculator_id
     where cl.user_id = $1
     order by cl.created_at desc
     limit 100`,
    [userId]
  );
  res.json({ history: result.rows });
});

export default router;
