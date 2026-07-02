import { useState, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Category } from "../api/client";

interface Props {
  category: Category;
  count: number;
  onRename: (id: string, name: string) => void;
  onDelete: (category: Category) => void;
  onAddCalculator: (categoryId: string) => void;
  children: ReactNode;
}

export function SortableCategorySection({ category, count, onRename, onDelete, onAddCalculator, children }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    data: { type: "category" },
  });
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(category.name);
  const [collapsed, setCollapsed] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const saveRename = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== category.name) onRename(category.id, trimmed);
    setEditing(false);
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-2 bg-slate-50 ${collapsed ? "" : "border-b border-slate-200"}`}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="text-slate-400 hover:text-slate-600 p-0.5"
          title={collapsed ? "Expand" : "Collapse"}
        >
          <span className={`inline-block text-xs transition-transform ${collapsed ? "-rotate-90" : ""}`}>
            ▼
          </span>
        </button>
        <button
          {...attributes}
          {...listeners}
          className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none"
          title="Drag to reorder category"
        >
          ⠿
        </button>
        {editing ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={saveRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveRename();
              if (e.key === "Escape") {
                setDraftName(category.name);
                setEditing(false);
              }
            }}
            className="text-sm font-semibold text-slate-900 rounded border border-brand-300 px-1.5 py-0.5 focus:outline-none"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-sm font-semibold text-slate-900 hover:text-brand-700"
            title="Click to rename"
          >
            {category.name}
          </button>
        )}
        <span className="text-xs text-slate-400">({count})</span>
        <div className="flex-1" />
        <button
          onClick={() => onAddCalculator(category.id)}
          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          + Add calculator
        </button>
        <button onClick={() => onDelete(category)} className="text-xs text-red-500 hover:text-red-700">
          Delete
        </button>
      </div>
      {!collapsed && <div>{children}</div>}
    </div>
  );
}
