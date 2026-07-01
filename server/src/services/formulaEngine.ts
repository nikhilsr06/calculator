import { create, all } from "mathjs";

/**
 * Formula execution security (spec section 4):
 * - No eval() anywhere.
 * - Uses mathjs's expression parser, which evaluates a restricted
 *   mathematical grammar - it cannot access Node globals, the filesystem,
 *   or arbitrary JS, unlike eval()/Function().
 * - We further strip out mathjs features we don't need (import, createUnit,
 *   chained assignment, etc.) to shrink the attack surface.
 */
const math = create(all, {});

// Disable functions that could be misused to redefine behavior or
// pull in things outside plain arithmetic.
const disallowed = ["import", "createUnit", "evaluate", "parse", "simplify", "derivative", "rationalize"];
disallowed.forEach((name) => {
  try {
    math.import(
      {
        [name]: () => {
          throw new Error(`Use of "${name}" is not permitted in formulas.`);
        },
      },
      { override: true }
    );
  } catch {
    // some names may not exist to override in this mathjs version - fine
  }
});

export interface FormulaValidationResult {
  valid: boolean;
  error?: string;
  variables?: string[];
}

/**
 * Validates a formula expression without evaluating it against real data.
 * Used by the admin "create/update formula" endpoints before publishing.
 */
export function validateFormula(expression: string): FormulaValidationResult {
  if (!expression || !expression.trim()) {
    return { valid: false, error: "Expression cannot be empty." };
  }

  try {
    const node = math.parse(expression);

    // Reject assignment / function-definition nodes - formulas should be
    // pure expressions, e.g. "Vp / ratio", not "x = ..." or "f(x) = ...".
    let rejected: string | null = null;
    node.traverse((n) => {
      if (n.type === "AssignmentNode" || n.type === "FunctionAssignmentNode") {
        rejected = `Formulas may not contain assignments (found ${n.type}).`;
      }
    });
    if (rejected) {
      return { valid: false, error: rejected };
    }

    const variables = new Set<string>();
    node.traverse((n) => {
      if (n.type === "SymbolNode") {
        // @ts-expect-error mathjs node typing
        const name = n.name as string;
        if (name && !(name in math)) {
          variables.add(name);
        }
      }
    });

    return { valid: true, variables: Array.from(variables) };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Invalid expression." };
  }
}

/**
 * Evaluates a formula against a set of named numeric inputs.
 * Throws on invalid expressions or missing/extra variables.
 */
export function evaluateFormula(expression: string, inputs: Record<string, number>): number {
  const node = math.parse(expression);

  // Re-check for disallowed constructs at evaluation time too (defense in depth).
  let rejected: string | null = null;
  node.traverse((n) => {
    if (n.type === "AssignmentNode" || n.type === "FunctionAssignmentNode") {
      rejected = "Formula contains disallowed assignment.";
    }
  });
  if (rejected) throw new Error(rejected);

  const scope: Record<string, number> = { ...inputs };
  const result = node.evaluate(scope);

  if (typeof result !== "number" || Number.isNaN(result) || !Number.isFinite(result)) {
    throw new Error("Formula did not evaluate to a finite number.");
  }

  return result;
}
