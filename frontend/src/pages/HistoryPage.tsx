import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { api } from "../api/client";

interface HistoryItem {
  id: string;
  calculator_name: string;
  inputs: Record<string, unknown>;
  result: number;
  created_at: string;
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .history()
      .then((res) => setItems(res.history))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <h1 className="text-lg font-semibold text-slate-900 mb-4">Calculation History</h1>
      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-slate-500">No calculations yet.</p>
      )}
      <div className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg">
        {items.map((item) => (
          <div key={item.id} className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900">{item.calculator_name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {Object.entries(item.inputs)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ")}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {new Date(item.created_at).toLocaleString()}
              </p>
            </div>
            <div className="text-lg font-semibold text-brand-700">{item.result}</div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
