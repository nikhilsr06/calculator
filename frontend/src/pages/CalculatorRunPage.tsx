import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { api } from "../api/client";

interface InputDef {
  id: string;
  name: string;
  label: string;
  type: "number" | "text";
  required: boolean;
  display_order: number;
  unit: string | null;
}

export default function CalculatorRunPage() {
  const { id } = useParams<{ id: string }>();
  const [calcName, setCalcName] = useState("");
  const [description, setDescription] = useState<string | null>(null);
  const [resultUnit, setResultUnit] = useState<string | null>(null);
  const [inputDefs, setInputDefs] = useState<InputDef[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getCalculator(id)
      .then((res) => {
        setCalcName(res.calculator.name);
        setDescription(res.calculator.description);
        setResultUnit(res.calculator.result_unit);
        setInputDefs(res.inputs);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleCalculate = async () => {
    if (!id) return;
    setError(null);
    setResult(null);
    setCalculating(true);
    try {
      const res = await api.calculate(id, values);
      setResult(res.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calculation failed");
    } finally {
      setCalculating(false);
    }
  };

  const handleClear = () => {
    setValues({});
    setResult(null);
    setError(null);
  };

  return (
    <Layout>
      <Link to="/" className="inline-block text-xs text-brand-600 hover:text-brand-700 mb-3">
        ← All calculators
      </Link>
      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {!loading && (
        <div className="max-w-sm bg-white border border-slate-200 rounded-lg p-4">
          <h1 className="text-base font-semibold text-slate-900">{calcName}</h1>
          {description && <p className="text-xs text-slate-500 mt-0.5 mb-3">{description}</p>}

          <div className={`space-y-2.5 ${description ? "" : "mt-3"}`}>
            {inputDefs.map((input) => (
              <div key={input.id}>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {input.label}
                  {input.unit && (
                    <span className="text-slate-400 font-normal font-mono ml-1">({input.unit})</span>
                  )}
                  {input.required && <span className="text-red-500"> *</span>}
                </label>
                <div className="relative">
                  <input
                    type={input.type === "number" ? "number" : "text"}
                    value={values[input.name] ?? ""}
                    onChange={(e) => handleChange(input.name, e.target.value)}
                    className={`w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                      input.unit ? "pr-12" : ""
                    }`}
                  />
                  {input.unit && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono pointer-events-none">
                      {input.unit}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={handleCalculate}
              disabled={calculating}
              className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-1.5 hover:bg-brand-700 disabled:opacity-60"
            >
              {calculating ? "Calculating..." : "Calculate"}
            </button>
            <button
              onClick={handleClear}
              className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-1.5 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          {result !== null && (
            <div className="mt-4 rounded-lg bg-brand-50 border border-brand-100 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-brand-600 font-medium">Result</p>
              <p className="text-xl font-semibold text-brand-900 mt-0.5">
                {result}
                {resultUnit && <span className="text-sm font-medium text-brand-600 ml-1.5">{resultUnit}</span>}
              </p>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
