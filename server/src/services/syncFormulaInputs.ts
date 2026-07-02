import type { PoolClient } from "pg";
import { validateFormula } from "./formulaEngine";

/**
 * Keeps formula_inputs in sync with the variables used in an expression.
 * Called when a formula version is published, and lazily when employees
 * open a calculator (so stale inputs self-heal after formula changes).
 */
export async function syncFormulaInputs(
  client: PoolClient,
  calculatorId: string,
  expression: string
): Promise<string[]> {
  const validation = validateFormula(expression);
  if (!validation.valid || !validation.variables) {
    return [];
  }

  const variables = validation.variables;

  const existing = await client.query<{ id: string; name: string }>(
    `select id, name from formula_inputs where calculator_id = $1`,
    [calculatorId]
  );
  const existingByName = new Map(existing.rows.map((r) => [r.name, r.id]));
  const variableSet = new Set(variables);

  for (const row of existing.rows) {
    if (!variableSet.has(row.name)) {
      await client.query(`delete from formula_inputs where id = $1`, [row.id]);
    }
  }

  let insertOrder = variables.length;
  for (const name of variables) {
    if (!existingByName.has(name)) {
      await client.query(
        `insert into formula_inputs (calculator_id, name, label, type, required, display_order, unit)
         values ($1, $2, $3, 'number', true, $4, null)`,
        [calculatorId, name, name, insertOrder++]
      );
    }
  }

  for (let i = 0; i < variables.length; i++) {
    await client.query(
      `update formula_inputs set display_order = $1 where calculator_id = $2 and name = $3`,
      [i, calculatorId, variables[i]]
    );
  }

  return variables;
}
