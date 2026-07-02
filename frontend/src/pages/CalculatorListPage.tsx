import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { api, type EmployeeCalculator } from "../api/client";

interface CategoryGroup {
  id: string;
  name: string;
  calculators: EmployeeCalculator[];
}

function matchesSearch(c: EmployeeCalculator, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return c.name.toLowerCase().includes(q) || (c.description?.toLowerCase().includes(q) ?? false);
}

function CalculatorRow({ calc }: { calc: EmployeeCalculator }) {
  return (
    <Link
      to={`/calculators/${calc.id}`}
      className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{calc.name}</p>
        {calc.description && <p className="text-xs text-slate-500 truncate">{calc.description}</p>}
      </div>
      <span className="text-slate-300 shrink-0">›</span>
    </Link>
  );
}

function CollapsibleCategoryGroup({
  title,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5 px-0.5 hover:text-slate-600 w-full text-left"
      >
        <span
          className={`inline-block text-[10px] transition-transform ${open ? "" : "-rotate-90"}`}
        >
          ▼
        </span>
        {title}
        {count !== undefined && <span className="font-normal normal-case">({count})</span>}
      </button>
      {open && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">{children}</div>
      )}
    </div>
  );
}

export default function CalculatorListPage() {
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [uncategorized, setUncategorized] = useState<EmployeeCalculator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .listCalculators()
      .then((res) => {
        setCategories(res.categories ?? []);
        setUncategorized(res.uncategorized ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const totalCount = useMemo(
    () =>
      categories.reduce((sum, c) => sum + (c.calculators?.length ?? 0), 0) +
      (uncategorized?.length ?? 0),
    [categories, uncategorized]
  );

  const filteredGroups = useMemo(() => {
    const groups = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      calculators: cat.calculators.filter((c) => matchesSearch(c, search)),
    }));
    const filteredUncategorized = uncategorized.filter((c) => matchesSearch(c, search));
    return { groups: groups.filter((g) => g.calculators.length > 0), filteredUncategorized };
  }, [categories, uncategorized, search]);

  const noResults =
    !loading &&
    totalCount > 0 &&
    filteredGroups.groups.length === 0 &&
    filteredGroups.filteredUncategorized.length === 0;

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h1 className="text-lg font-semibold text-slate-900">Calculators</h1>
        {!loading && totalCount > 0 && (
          <input
            type="search"
            placeholder="Search calculators..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        )}
      </div>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && totalCount === 0 && (
        <p className="text-sm text-slate-500">No calculators are available yet.</p>
      )}
      {noResults && <p className="text-sm text-slate-500">No calculators match your search.</p>}

      {!loading && (
        <div className="space-y-4">
          {filteredGroups.groups.map((group) => (
            <CollapsibleCategoryGroup key={group.id} title={group.name} count={group.calculators.length}>
              {group.calculators.map((calc) => (
                <CalculatorRow key={calc.id} calc={calc} />
              ))}
            </CollapsibleCategoryGroup>
          ))}

          {filteredGroups.filteredUncategorized.length > 0 && (
            <CollapsibleCategoryGroup
              title="Other"
              count={filteredGroups.filteredUncategorized.length}
            >
              {filteredGroups.filteredUncategorized.map((calc) => (
                <CalculatorRow key={calc.id} calc={calc} />
              ))}
            </CollapsibleCategoryGroup>
          )}
        </div>
      )}
    </Layout>
  );
}
