import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { api } from "../api/client";

interface Calculator {
  id: string;
  name: string;
  description: string | null;
}

function matchesSearch(c: Calculator, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    c.name.toLowerCase().includes(q) ||
    (c.description?.toLowerCase().includes(q) ?? false)
  );
}

export default function CalculatorListPage() {
  const [calculators, setCalculators] = useState<Calculator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => calculators.filter((c) => matchesSearch(c, search)),
    [calculators, search]
  );

  useEffect(() => {
    api
      .listCalculators()
      .then((res) => setCalculators(res.calculators))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h1 className="text-lg font-semibold text-slate-900">Calculators</h1>
        {!loading && calculators.length > 0 && (
          <input
            type="search"
            placeholder="Search calculators..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-72 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        )}
      </div>
      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && calculators.length === 0 && (
        <p className="text-sm text-slate-500">No calculators are available yet.</p>
      )}
      {!loading && calculators.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-slate-500">No calculators match your search.</p>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        {filtered.map((c) => (
          <Link
            key={c.id}
            to={`/calculators/${c.id}`}
            className="block rounded-lg border border-slate-200 bg-white p-5 hover:border-brand-400 hover:shadow-sm transition"
          >
            <h2 className="font-medium text-slate-900">{c.name}</h2>
            {c.description && <p className="text-sm text-slate-500 mt-1">{c.description}</p>}
          </Link>
        ))}
      </div>
    </Layout>
  );
}
