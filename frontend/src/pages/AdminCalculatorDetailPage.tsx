import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";

interface FormulaVersion {
  id: string;
  expression: string;
  version_number: number;
  active: boolean;
  created_at: string;
}

export default function AdminCalculatorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [versions, setVersions] = useState<FormulaVersion[]>([]);
  const [expression, setExpression] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!id) return;
    setLoading(true);
    api
      .adminListFormulaVersions(id)
      .then((res) => setVersions(res.formulaVersions))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const handleCreateVersion = async (publish: boolean) => {
    if (!id || !expression.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await api.adminCreateFormula({ calculatorId: id, expression, publish });
      setExpression("");
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

  return (
    <>
      <Link
        to="/admin/calculators"
        className="inline-block text-sm text-brand-600 hover:text-brand-700 mb-4"
      >
        ← Back to calculators
      </Link>
      <h2 className="text-base font-semibold text-slate-900 mb-6">Formula Versions</h2>

      <div className="bg-white border border-slate-200 rounded-lg p-5 mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-1">New expression</label>
        <p className="text-xs text-slate-500 mb-2">
          Use variable names matching this calculator's input fields, e.g. <code>Vp / ratio</code>
        </p>
        <textarea
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
        />
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

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

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
