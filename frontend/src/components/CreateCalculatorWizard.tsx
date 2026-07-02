import { useState } from "react";
import { api, type Category } from "../api/client";
import { FormulaExpressionInput } from "./FormulaExpressionInput";

interface VariableRow {
  name: string;
  label: string;
  type: "number" | "text";
  required: boolean;
  unit: string;
}

interface Props {
  categories: Category[];
  defaultCategoryId?: string | null;
  onClose: () => void;
  onCreated: () => void;
}

const STEP_LABELS = ["Expression", "Confirm variables", "Description & units"];

export function CreateCalculatorWizard({ categories, defaultCategoryId, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);

  // Step 1
  const [name, setName] = useState("");
  const [expression, setExpression] = useState("");
  const [extracting, setExtracting] = useState(false);

  // Step 2
  const [variables, setVariables] = useState<VariableRow[]>([]);

  // Step 3
  const [description, setDescription] = useState("");
  const [resultUnit, setResultUnit] = useState("");
  const [categoryId, setCategoryId] = useState<string>(defaultCategoryId ?? "");
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const handleExtract = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Give the calculator a name first.");
      return;
    }
    if (!expression.trim()) {
      setError("Enter a formula expression first.");
      return;
    }
    setExtracting(true);
    try {
      const validation = await api.adminValidateExpression(expression.trim());
      if (!validation.valid) {
        setError(validation.error || "That expression could not be parsed.");
        return;
      }
      const found = validation.variables ?? [];
      setVariables(
        found.map((v) => ({ name: v, label: v, type: "number" as const, required: true, unit: "" }))
      );
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate expression");
    } finally {
      setExtracting(false);
    }
  };

  const updateVariable = (idx: number, field: keyof VariableRow, value: string | boolean) =>
    setVariables((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));

  const handleCreate = async (publish: boolean) => {
    setError(null);
    setSaving(true);
    try {
      await api.adminCreateCalculator({
        name: name.trim(),
        description: description.trim() || undefined,
        category_id: categoryId || null,
        result_unit: resultUnit.trim() || undefined,
        inputs: variables.map((v, i) => ({
          name: v.name,
          label: v.label.trim() || v.name,
          type: v.type,
          required: v.required,
          display_order: i,
          unit: v.unit.trim() || undefined,
        })),
        expression: expression.trim(),
        publish,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create calculator");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[95vh] overflow-y-auto">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white rounded-t-lg">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">New Calculator</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Step {step} of 3 · {STEP_LABELS[step - 1]}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          {step === 1 && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Voltage Drop"
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Formula expression <span className="text-red-500">*</span>
                </label>
                <FormulaExpressionInput
                  value={expression}
                  onChange={setExpression}
                  placeholder="e.g. sqrt(Vp^2 + Ip^2)"
                  rows={2}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Use the keypad to build your formula. Variables are detected automatically in the next step.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExtract}
                  disabled={extracting}
                  className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-60"
                >
                  {extracting ? "Extracting..." : "Extract variables →"}
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 font-mono">
                {expression}
              </p>
              {variables.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No variables were found in this expression — it will always calculate to the
                  same constant value. Continue if that's intentional.
                </p>
              ) : (
                <div>
                  <p className="text-xs font-medium text-slate-700 mb-2">
                    We found {variables.length} variable{variables.length === 1 ? "" : "s"}. Confirm
                    labels and units shown to employees.
                  </p>
                  <div className="rounded-md border border-slate-200 overflow-hidden">
                    <div className="grid grid-cols-[minmax(60px,1fr)_minmax(100px,2fr)_minmax(72px,1fr)_72px_44px] gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                      <span className="text-xs font-medium text-slate-500">Variable</span>
                      <span className="text-xs font-medium text-slate-500">Label</span>
                      <span className="text-xs font-medium text-slate-500">Unit</span>
                      <span className="text-xs font-medium text-slate-500">Type</span>
                      <span className="text-xs font-medium text-slate-500">Req.</span>
                    </div>
                    {variables.map((v, idx) => (
                      <div
                        key={v.name}
                        className="grid grid-cols-[minmax(60px,1fr)_minmax(100px,2fr)_minmax(72px,1fr)_72px_44px] gap-2 px-3 py-2 border-b border-slate-100 last:border-0 items-center"
                      >
                        <span className="text-sm font-mono text-slate-700 truncate">{v.name}</span>
                        <input
                          value={v.label}
                          onChange={(e) => updateVariable(idx, "label", e.target.value)}
                          className="rounded border border-slate-300 px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <input
                          value={v.unit}
                          onChange={(e) => updateVariable(idx, "unit", e.target.value)}
                          placeholder="e.g. V"
                          className="rounded border border-slate-300 px-2 py-1 text-sm w-full font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <select
                          value={v.type}
                          onChange={(e) => updateVariable(idx, "type", e.target.value)}
                          className="rounded border border-slate-300 px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                        >
                          <option value="number">number</option>
                          <option value="text">text</option>
                        </select>
                        <div className="flex justify-center">
                          <input
                            type="checkbox"
                            checked={v.required}
                            onChange={(e) => updateVariable(idx, "required", e.target.checked)}
                            className="w-4 h-4 accent-brand-600"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-between pt-1">
                <button
                  onClick={() => setStep(1)}
                  className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700"
                >
                  Looks correct →
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Short description shown to employees (optional)"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Result unit
                  </label>
                  <input
                    value={resultUnit}
                    onChange={(e) => setResultUnit(e.target.value)}
                    placeholder="e.g. kg, $, m/s²"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Shown next to the calculated result.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-between pt-1">
                <button
                  onClick={() => setStep(2)}
                  className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50"
                >
                  ← Back
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCreate(false)}
                    disabled={saving}
                    className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Save as draft
                  </button>
                  <button
                    onClick={() => handleCreate(true)}
                    disabled={saving}
                    className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-60"
                  >
                    {saving ? "Creating..." : "Create & Publish"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
