import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type AdminCalculator, type Category } from "../api/client";
import { FormulaExpressionInput } from "../components/FormulaExpressionInput";

interface FormulaVersion {
  id: string;
  expression: string;
  version_number: number;
  active: boolean;
  created_at: string;
}

interface InputRow {
  id: string;
  name: string;
  label: string;
  type: "number" | "text";
  required: boolean;
  display_order: number;
  unit: string;
}

export default function AdminCalculatorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [calculator, setCalculator] = useState<AdminCalculator | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [versions, setVersions] = useState<FormulaVersion[]>([]);

  const [expression, setExpression] = useState("");
  const [previewVariables, setPreviewVariables] = useState<string[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [checkingExpression, setCheckingExpression] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Details form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [resultUnit, setResultUnit] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);

  const [inputs, setInputs] = useState<InputRow[]>([]);
  const [savingInputs, setSavingInputs] = useState(false);
  const [inputsSaved, setInputsSaved] = useState(false);

  const load = () => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.adminGetCalculator(id),
      api.adminListCategories(),
      api.adminListFormulaVersions(id),
      api.adminListCalculatorInputs(id),
    ])
      .then(([calcRes, catRes, formulasRes, inputsRes]) => {
        setCalculator(calcRes.calculator);
        setCategories(catRes.categories);
        setVersions(formulasRes.formulaVersions);
        setInputs(
          inputsRes.inputs.map((row) => ({
            ...row,
            unit: row.unit ?? "",
          }))
        );
        setName(calcRes.calculator.name);
        setDescription(calcRes.calculator.description ?? "");
        setCategoryId(calcRes.calculator.category_id ?? "");
        setResultUnit(calcRes.calculator.result_unit ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const handleCheckExpression = async () => {
    if (!expression.trim()) return;
    setPreviewError(null);
    setPreviewVariables(null);
    setCheckingExpression(true);
    try {
      const result = await api.adminValidateExpression(expression.trim());
      if (!result.valid) {
        setPreviewError(result.error || "Invalid expression");
      } else {
        setPreviewVariables(result.variables ?? []);
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to validate expression");
    } finally {
      setCheckingExpression(false);
    }
  };

  const handleCreateVersion = async (publish: boolean) => {
    if (!id || !expression.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await api.adminCreateFormula({ calculatorId: id, expression, publish });
      setExpression("");
      setPreviewVariables(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save formula");
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (versionId: string) => {
    await api.adminUpdateFormula(versionId, { active: true });
    load();
  };

  const handleSaveDetails = async () => {
    if (!id) return;
    setSavingDetails(true);
    setDetailsSaved(false);
    try {
      await api.adminUpdateCalculator(id, {
        name: name.trim(),
        description: description.trim(),
        category_id: categoryId || null,
        result_unit: resultUnit.trim(),
      });
      setDetailsSaved(true);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save details");
    } finally {
      setSavingDetails(false);
    }
  };

  const handleSaveInputs = async () => {
    if (!id) return;
    setSavingInputs(true);
    setInputsSaved(false);
    try {
      await api.adminUpdateCalculatorInputs(
        id,
        inputs.map((row) => ({
          id: row.id,
          label: row.label.trim() || row.name,
          unit: row.unit.trim(),
        }))
      );
      setInputsSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save inputs");
    } finally {
      setSavingInputs(false);
    }
  };

  return (
    <>
      <Link
        to="/admin/calculators"
        className="inline-block text-sm text-brand-600 hover:text-brand-700 mb-4"
      >
        ← Back to calculators
      </Link>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {calculator && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Details</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
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
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Result unit</label>
              <input
                value={resultUnit}
                onChange={(e) => setResultUnit(e.target.value)}
                placeholder="e.g. kg, $, m/s²"
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleSaveDetails}
              disabled={savingDetails}
              className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-60"
            >
              {savingDetails ? "Saving..." : "Save details"}
            </button>
            {detailsSaved && <span className="text-xs text-green-600">Saved</span>}
          </div>
        </div>
      )}

      {inputs.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Input variables</h2>
          <p className="text-xs text-slate-500 mb-4">
            Labels and units shown to employees when they enter values.
          </p>
          <div className="rounded-md border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_1fr_72px] gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
              <span className="text-xs font-medium text-slate-500">Variable</span>
              <span className="text-xs font-medium text-slate-500">Label</span>
              <span className="text-xs font-medium text-slate-500">Unit</span>
              <span className="text-xs font-medium text-slate-500">Type</span>
            </div>
            {inputs.map((row, idx) => (
              <div
                key={row.id}
                className="grid grid-cols-[1fr_1fr_1fr_72px] gap-2 px-3 py-2 border-b border-slate-100 last:border-0 items-center"
              >
                <span className="text-sm font-mono text-slate-700 truncate">{row.name}</span>
                <input
                  value={row.label}
                  onChange={(e) =>
                    setInputs((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r))
                    )
                  }
                  className="rounded border border-slate-300 px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <input
                  value={row.unit}
                  onChange={(e) =>
                    setInputs((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, unit: e.target.value } : r))
                    )
                  }
                  placeholder="e.g. V"
                  className="rounded border border-slate-300 px-2 py-1 text-sm w-full font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <span className="text-xs text-slate-500">{row.type}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleSaveInputs}
              disabled={savingInputs}
              className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-60"
            >
              {savingInputs ? "Saving..." : "Save inputs"}
            </button>
            {inputsSaved && <span className="text-xs text-green-600">Saved</span>}
          </div>
        </div>
      )}

      <h2 className="text-base font-semibold text-slate-900 mb-3">Formula Versions</h2>

      <div className="bg-white border border-slate-200 rounded-lg p-5 mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-1">New expression</label>
        <p className="text-xs text-slate-500 mb-2">
          Use variable names matching this calculator's input fields, e.g. <code>Vp / ratio</code>
        </p>
        <FormulaExpressionInput
          value={expression}
          onChange={(v) => {
            setExpression(v);
            setPreviewVariables(null);
          }}
          placeholder="Build formula with keypad…"
          rows={2}
        />
        <button
          onClick={handleCheckExpression}
          disabled={checkingExpression || !expression.trim()}
          className="mt-2 text-xs text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
        >
          {checkingExpression ? "Checking..." : "Check variables"}
        </button>

        {previewError && <p className="text-sm text-red-600 mt-2">{previewError}</p>}
        {previewVariables && (
          <p className="text-xs text-slate-500 mt-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            {previewVariables.length > 0
              ? `Variables used: ${previewVariables.join(", ")}`
              : "No variables found — this expression evaluates to a constant."}
          </p>
        )}

        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <div className="flex gap-3 mt-3">
          <button
            onClick={() => handleCreateVersion(false)}
            disabled={saving}
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50 disabled:opacity-60"
          >
            Save as draft
          </button>
          <button
            onClick={() => handleCreateVersion(true)}
            disabled={saving}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-60"
          >
            Save & Publish
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg">
        {versions.map((v) => (
          <div key={v.id} className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-mono text-slate-800">{v.expression}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                v{v.version_number} · {new Date(v.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {v.active ? (
                <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-100 text-green-700">
                  Active
                </span>
              ) : (
                <button onClick={() => handleActivate(v.id)} className="text-sm text-brand-600 hover:text-brand-700">
                  Publish
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
