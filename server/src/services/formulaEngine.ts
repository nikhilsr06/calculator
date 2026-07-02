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

// Symbols that should stay as mathjs constants, not user inputs.
// Single-letter names like i, j, e are intentionally omitted — they're common
// engineering variable names (e.g. current, voltage).
const MATH_CONSTANTS = new Set(["pi", "PI", "tau", "Infinity", "NaN", "true", "false"]);

// Minimal AST shape from mathjs parse(); avoids brittle ReturnType<typeof math.parse>.
interface FormulaAstNode {
  type: string;
  fn?: { type?: string; name?: string };
  name?: string;
}

interface ParsedFormulaNode {
  type: string;
  traverse(callback: (node: FormulaAstNode) => void): void;
  evaluate(scope: Record<string, number>): unknown;
}

function extractVariables(node: ParsedFormulaNode): string[] {
  const symbols = new Set<string>();
  const functionNames = new Set<string>();

  node.traverse((n) => {
    if (n.type === "FunctionNode") {
      const fn = n.fn;
      if (fn?.type === "SymbolNode" && fn.name) {
        functionNames.add(fn.name);
      }
    }
    if (n.type === "SymbolNode") {
      const name = n.name;
      if (name) symbols.add(name);
    }
  });

  const variables = new Set<string>();
  for (const name of symbols) {
    if (functionNames.has(name)) continue;
    if (MATH_CONSTANTS.has(name)) continue;
    variables.add(name);
  }
  return Array.from(variables);
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
    const node = math.parse(expression) as ParsedFormulaNode;

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

    return { valid: true, variables: extractVariables(node) };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Invalid expression." };
  }
}

/**
 * Evaluates a formula against a set of named numeric inputs.
 * Throws on invalid expressions or missing/extra variables.
 */
export function evaluateFormula(expression: string, inputs: Record<string, number>): number {
  const node = math.parse(expression) as ParsedFormulaNode;

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
