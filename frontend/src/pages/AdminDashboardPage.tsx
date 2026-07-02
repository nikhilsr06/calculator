import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { api, type AdminCalculator, type Category } from "../api/client";
import { CreateCalculatorWizard } from "../components/CreateCalculatorWizard";
import { SortableCategorySection } from "../components/SortableCategorySection";
import { SortableCalculatorRow } from "../components/SortableCalculatorRow";

const UNCATEGORIZED = "__uncategorized__";

export default function AdminDashboardPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [calculators, setCalculators] = useState<AdminCalculator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showWizard, setShowWizard] = useState(false);
  const [wizardDefaultCategory, setWizardDefaultCategory] = useState<string | null>(null);

  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = () => {
    setLoading(true);
    Promise.all([api.adminListCategories(), api.adminListCalculators()])
      .then(([catRes, calcRes]) => {
        setCategories(catRes.categories);
        setCalculators(calcRes.calculators);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const orderedCategories = useMemo(
    () => [...categories].sort((a, b) => a.display_order - b.display_order),
    [categories]
  );

  const byContainer = useMemo(() => {
    const map: Record<string, AdminCalculator[]> = { [UNCATEGORIZED]: [] };
    for (const cat of orderedCategories) map[cat.id] = [];
    for (const calc of calculators) {
      const key = calc.category_id ?? UNCATEGORIZED;
      (map[key] ??= []).push(calc);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.display_order - b.display_order);
    }
    return map;
  }, [orderedCategories, calculators]);

  const applyOptimisticOrder = (containerId: string, orderedIds: string[]) => {
    const categoryIdValue = containerId === UNCATEGORIZED ? null : containerId;
    setCalculators((prev) => {
      const orderMap = new Map(orderedIds.map((id, idx) => [id, idx]));
      return prev.map((c) =>
        orderMap.has(c.id) ? { ...c, category_id: categoryIdValue, display_order: orderMap.get(c.id)! } : c
      );
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const type = active.data.current?.type;

    if (type === "category") {
      const ids = orderedCategories.map((c) => c.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(ids, oldIndex, newIndex);
      setCategories((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]));
        return newOrder.map((id, idx) => ({ ...byId.get(id)!, display_order: idx }));
      });
      api.adminReorderCategories(newOrder).catch(load);
      return;
    }

    if (type === "calculator") {
      const containerId = active.data.current?.containerId as string;
      const items = byContainer[containerId]?.map((c) => c.id) ?? [];
      const oldIndex = items.indexOf(active.id as string);
      const newIndex = items.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(items, oldIndex, newIndex);
      applyOptimisticOrder(containerId, newOrder);
      const categoryIdParam = containerId === UNCATEGORIZED ? null : containerId;
      api.adminReorderCalculators(categoryIdParam, newOrder).catch(load);
    }
  };

  const handleAddCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setAddingCategory(false);
      return;
    }
    try {
      await api.adminCreateCategory(trimmed);
      setNewCategoryName("");
      setAddingCategory(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category");
    }
  };

  const handleRenameCategory = async (id: string, name: string) => {
    try {
      await api.adminUpdateCategory(id, name);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename category");
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    if (
      !confirm(
        `Delete category "${category.name}"? Its calculators will move to Uncategorized.`
      )
    )
      return;
    try {
      await api.adminDeleteCategory(category.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete category");
    }
  };

  const handleToggleActive = async (calc: AdminCalculator) => {
    await api.adminUpdateCalculator(calc.id, { active: !calc.active });
    load();
  };

  const handleDeleteCalculator = async (calc: AdminCalculator) => {
    if (!confirm(`Delete "${calc.name}"? This cannot be undone.`)) return;
    try {
      await api.adminDeleteCalculator(calc.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete calculator");
    }
  };

  const handleMoveCalculator = async (calc: AdminCalculator, categoryId: string | null) => {
    try {
      await api.adminUpdateCalculator(calc.id, { category_id: categoryId });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move calculator");
    }
  };

  const openWizard = (defaultCategoryId: string | null = null) => {
    setWizardDefaultCategory(defaultCategoryId);
    setShowWizard(true);
  };

  const uncategorized = byContainer[UNCATEGORIZED] ?? [];
  const [uncategorizedCollapsed, setUncategorizedCollapsed] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between mb-5 gap-2">
        <div className="flex items-center gap-2">
          {addingCategory ? (
            <>
              <input
                autoFocus
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                placeholder="Category name"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                onClick={handleAddCategory}
                className="rounded-md bg-brand-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-brand-700"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setAddingCategory(false);
                  setNewCategoryName("");
                }}
                className="text-sm text-slate-500 hover:text-slate-700 px-2"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setAddingCategory(true)}
              className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50"
            >
              + New Category
            </button>
          )}
        </div>
        <button
          onClick={() => openWizard(null)}
          className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700"
        >
          + New Calculator
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!loading && categories.length === 0 && calculators.length === 0 && (
        <div className="text-center py-12 bg-white border border-slate-200 rounded-lg">
          <p className="text-sm text-slate-500">
            No categories or calculators yet. Start by creating a category or a calculator.
          </p>
        </div>
      )}

      {!loading && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedCategories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {orderedCategories.map((cat) => {
                const items = byContainer[cat.id] ?? [];
                return (
                  <SortableCategorySection
                    key={cat.id}
                    category={cat}
                    count={items.length}
                    onRename={handleRenameCategory}
                    onDelete={handleDeleteCategory}
                    onAddCalculator={openWizard}
                  >
                    <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                      {items.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-slate-400 text-center">
                          No calculators in this category yet.
                        </p>
                      ) : (
                        items.map((calc) => (
                          <SortableCalculatorRow
                            key={calc.id}
                            calc={calc}
                            containerId={cat.id}
                            categories={categories}
                            onToggleActive={handleToggleActive}
                            onDelete={handleDeleteCalculator}
                            onMove={handleMoveCalculator}
                          />
                        ))
                      )}
                    </SortableContext>
                  </SortableCategorySection>
                );
              })}
            </div>
          </SortableContext>

          {/* Uncategorized bucket - always last, not itself sortable as a category */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mt-4">
            <div className={`flex items-center gap-2 px-3 py-2 bg-slate-50 ${uncategorizedCollapsed ? "" : "border-b border-slate-200"}`}>
              <button
                type="button"
                onClick={() => setUncategorizedCollapsed((c) => !c)}
                className="text-slate-400 hover:text-slate-600 p-0.5"
                title={uncategorizedCollapsed ? "Expand" : "Collapse"}
              >
                <span
                  className={`inline-block text-xs transition-transform ${uncategorizedCollapsed ? "-rotate-90" : ""}`}
                >
                  ▼
                </span>
              </button>
              <span className="text-sm font-semibold text-slate-600">Uncategorized</span>
              <span className="text-xs text-slate-400">({uncategorized.length})</span>
              <div className="flex-1" />
              <button
                onClick={() => openWizard(null)}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                + Add calculator
              </button>
            </div>
            {!uncategorizedCollapsed && (
              <SortableContext items={uncategorized.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {uncategorized.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-slate-400 text-center">
                    No uncategorized calculators.
                  </p>
                ) : (
                  uncategorized.map((calc) => (
                    <SortableCalculatorRow
                      key={calc.id}
                      calc={calc}
                      containerId={UNCATEGORIZED}
                      categories={categories}
                      onToggleActive={handleToggleActive}
                      onDelete={handleDeleteCalculator}
                      onMove={handleMoveCalculator}
                    />
                  ))
                )}
              </SortableContext>
            )}
          </div>
        </DndContext>
      )}

      {showWizard && (
        <CreateCalculatorWizard
          categories={categories}
          defaultCategoryId={wizardDefaultCategory}
          onClose={() => setShowWizard(false)}
          onCreated={load}
        />
      )}
    </>
  );
}
