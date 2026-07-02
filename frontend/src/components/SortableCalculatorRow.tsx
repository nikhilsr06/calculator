import { Link } from "react-router-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AdminCalculator, Category } from "../api/client";

interface Props {
  calc: AdminCalculator;
  containerId: string;
  categories: Category[];
  onToggleActive: (calc: AdminCalculator) => void;
  onDelete: (calc: AdminCalculator) => void;
  onMove: (calc: AdminCalculator, categoryId: string | null) => void;
}

export function SortableCalculatorRow({ calc, containerId, categories, onToggleActive, onDelete, onMove }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: calc.id,
    data: { type: "calculator", containerId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[20px_1fr_auto] items-center gap-3 px-3 py-2 border-b border-slate-100 last:border-0 bg-white"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none"
        title="Drag to reorder"
      >
        ⠿
      </button>
      <div className="min-w-0">
        <Link
          to={`/admin/calculators/${calc.id}`}
          className="text-sm font-medium text-slate-900 hover:text-brand-700 truncate block"
        >
          {calc.name}
        </Link>
        {calc.description && <p className="text-xs text-slate-500 truncate">{calc.description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
            calc.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {calc.active ? "Active" : "Off"}
        </span>
        <select
          value={calc.category_id ?? ""}
          onChange={(e) => onMove(calc, e.target.value || null)}
          className="text-xs rounded border border-slate-200 px-1 py-1 text-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 max-w-[110px]"
          title="Move to category"
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button onClick={() => onToggleActive(calc)} className="text-xs text-brand-600 hover:text-brand-700">
          {calc.active ? "Disable" : "Enable"}
        </button>
        <button onClick={() => onDelete(calc)} className="text-xs text-red-500 hover:text-red-700">
          Delete
        </button>
      </div>
    </div>
  );
}
