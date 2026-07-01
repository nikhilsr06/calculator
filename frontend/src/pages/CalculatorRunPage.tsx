import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { api } from "../api/client";

interface InputDef {
  id: string;
  name: string;
  label: string;
  type: "number" | "text";
  required: boolean;
  display_order: number;
}

export default function CalculatorRunPage() {
  const { id } = useParams<{ id: string }>();
  const [calcName, setCalcName] = useState("");
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
      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {!loading && (
        <div className="max-w-md">
          <h1 className="text-lg font-semibold text-slate-900 mb-6">{calcName}</h1>

          <div className="space-y-4">
            {inputDefs.map((input) => (
              <div key={input.id}>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {input.label}
                  {input.required && <span className="text-red-500"> *</span>}
                </label>
                <input
                  type={input.type === "number" ? "number" : "text"}
                  value={values[input.name] ?? ""}
                  onChange={(e) => handleChange(input.name, e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            ))}
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={handleCalculate}
              disabled={calculating}
              className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-60"
            >
              {calculating ? "Calculating..." : "Calculate"}
            </button>
            <button
              onClick={handleClear}
              className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>

          {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

          {result !== null && (
            <div className="mt-6 rounded-lg bg-brand-50 border border-brand-100 p-4">
              <p className="text-xs uppercase tracking-wide text-brand-600 font-medium">Result</p>
              <p className="text-2xl font-semibold text-brand-900 mt-1">{result}</p>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
