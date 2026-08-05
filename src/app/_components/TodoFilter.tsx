"use client";

/**
 * FILTER BAR — pure UI, nothing to do with tRPC.
 * It reports the selected value upward (to TodosTab); TodoList is what
 * actually issues the query.
 */

export type FilterValue = "all" | "completed" | "active";

const OPTIONS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "active", label: "Active" },
];

export function TodoFilter({
  value,
  onChange,
}: {
  value: FilterValue;
  onChange: (value: FilterValue) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            value === option.value
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
