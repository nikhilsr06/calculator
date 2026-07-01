import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { api } from "../api/client";

interface Calculator {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
}

interface InputRow {
  name: string;
  label: string;
  type: "number" | "text";
  required: boolean;
}

const emptyInput = (): InputRow => ({ name: "", label: "", type: "number", required: true });

export default function AdminDashboardPage() {
  const [calculators, setCalculators] = useState<Calculator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inputs, setInputs] = useState<InputRow[]>([emptyInput()]);
  const [expression, setExpression] = useState("");
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .adminListCalculators()
      .then((res) => setCalculators(res.calculators))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const addInputRow = () => setInputs((prev) => [...prev, emptyInput()]);

  const updateInputRow = (idx: number, field: keyof InputRow, value: string | boolean) =>
    setInputs((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));

  const removeInputRow = (idx: number) =>
    setInputs((prev) => prev.filter((_, i) => i !== idx));

  const resetForm = () => {
    setName("");
    setDescription("");
    setInputs([emptyInput()]);
    setExpression("");
    setError(null);
  };

  const handleCreate = async (publish: boolean) => {
    setError(null);
    setCreating(true);
    try {
      const validInputs = inputs
        .filter((row) => row.name.trim() && row.label.trim())
        .map((row, i) => ({ ...row, display_order: i }));

      await api.adminCreateCalculator({
        name: name.trim(),
        description: description.trim() || undefined,
        inputs: validInputs,
        expression: expression.trim() || undefined,
        publish,
      });

      resetForm();
      setShowCreate(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create calculator");
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (calc: Calculator) => {
    await api.adminUpdateCalculator(calc.id, { active: !calc.active });
    load();
  };

  const handleDelete = async (calc: Calculator) => {
    if (!confirm(`Delete "${calc.name}"? This cannot be undone.`)) return;
    await api.adminDeleteCalculator(calc.id);
    load();
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-slate-900">Admin · Calculators</h1>
        <button
          onClick={() => { setShowCreate((s) => !s); resetForm(); }}
          className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700"
        >
          {showCreate ? "Cancel" : "New Calculator"}
        </button>
      </div>

      {/* ── Create form ─────────────────────────────────────────── */}
      {showCreate && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 mb-8 space-y-6">

          {/* Basic info */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional short description"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Input fields */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Input Fields</label>
              <button
                onClick={addInputRow}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                + Add field
              </button>
            </div>

            <div className="rounded-md border border-slate-200 overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_1fr_90px_70px_32px] gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                <span className="text-xs font-medium text-slate-500">Variable name</span>
                <span className="text-xs font-medium text-slate-500">Label shown to employee</span>
                <span className="text-xs font-medium text-slate-500">Type</span>
                <span className="text-xs font-medium text-slate-500">Required</span>
                <span />
              </div>

              {inputs.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_1fr_90px_70px_32px] gap-2 px-3 py-2 border-b border-slate-100 last:border-0 items-center"
                >
                  <input 
                    value={row.name}
                    onChange={(e) => updateInputRow(idx, "name", e.target.value)}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm w-full font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <input 
                    value={row.label}
                    onChange={(e) => updateInputRow(idx, "label", e.target.value)}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <select
                    value={row.type}
                    onChange={(e) => updateInputRow(idx, "type", e.target.value)}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="number">number</option>
                    <option value="text">text</option>
                  </select>
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={row.required}
                      onChange={(e) => updateInputRow(idx, "required", e.target.checked)}
                      className="w-4 h-4 accent-brand-600"
                    />
                  </div>
                  <button
                    onClick={() => removeInputRow(idx)}
                    disabled={inputs.length === 1}
                    className="text-slate-300 hover:text-red-500 disabled:opacity-0 text-sm font-medium"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Variable names are used in the formula expression below. Use snake_case, no spaces.
            </p>
          </div>

          {/* Formula */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Formula Expression
            </label>
            <textarea
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              rows={2} 
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Use the variable names you defined above. Supports standard math operators and
              functions (e.g. <code>sqrt</code>, <code>pow</code>, <code>abs</code>). You can
              leave this blank and add the formula later.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => handleCreate(false)}
              disabled={creating || !name.trim()}
              className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50 disabled:opacity-50"
            >
              {creating ? "Saving..." : expression ? "Save as draft" : "Create (no formula yet)"}
            </button>
            {expression.trim() && (
              <button
                onClick={() => handleCreate(true)}
                disabled={creating || !name.trim()}
                className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
              >
                {creating ? "Saving..." : "Create & Publish"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Calculator list ─────────────────────────────────────── */}
      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {error && !showCreate && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg">
        {!loading && calculators.length === 0 && (
          <p className="px-5 py-8 text-sm text-slate-500 text-center">
            No calculators yet. Create one above.
          </p>
        )}
        {calculators.map((c) => (
          <div key={c.id} className="px-5 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Link
                to={`/admin/calculators/${c.id}`}
                className="font-medium text-slate-900 hover:text-brand-700 truncate block"
              >
                {c.name}
              </Link>
              {c.description && (
                <p className="text-sm text-slate-500 truncate">{c.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span
                className={`text-xs px-2 py-1 rounded-full font-medium ${
                  c.active
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {c.active ? "Active" : "Disabled"}
              </span>
              <button
                onClick={() => toggleActive(c)}
                className="text-sm text-brand-600 hover:text-brand-700"
              >
                {c.active ? "Disable" : "Enable"}
              </button>
              <button
                onClick={() => handleDelete(c)}
                className="text-sm text-red-500 hover:text-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
