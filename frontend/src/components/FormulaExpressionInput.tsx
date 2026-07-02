import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type Tab = "main" | "abc" | "func";

interface InsertAction {
  text: string;
  /** Place cursor this many chars before the end of inserted text */
  cursorBeforeEnd?: number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

function Key({
  label,
  onClick,
  className = "",
  wide = false,
  tall = false,
  accent = false,
}: {
  label: ReactNode;
  onClick: () => void;
  className?: string;
  wide?: boolean;
  tall?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center justify-center rounded text-sm font-medium select-none transition-colors",
        "active:scale-[0.97]",
        accent
          ? "bg-brand-600 text-white hover:bg-brand-700"
          : "bg-white text-slate-800 hover:bg-slate-50 border border-slate-200",
        wide ? "col-span-2" : "",
        tall ? "row-span-2" : "",
        "min-h-[36px] px-1",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </button>
  );
}

function GrayKey(props: Omit<React.ComponentProps<typeof Key>, "accent">) {
  return <Key {...props} className={`bg-slate-100 border-slate-200 ${props.className ?? ""}`} />;
}

const ABC_ROWS_LOWER = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

const ABC_ROWS_UPPER = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

export function FormulaExpressionInput({
  value,
  onChange,
  placeholder = "Build your formula…",
  rows = 2,
  className = "",
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<Tab>("main");
  const [shift, setShift] = useState(false);
  const historyRef = useRef<string[]>([value]);
  const historyIndexRef = useRef(0);
  const skipHistoryRef = useRef(false);

  const pushHistory = useCallback(
    (next: string) => {
      if (skipHistoryRef.current) {
        skipHistoryRef.current = false;
        return;
      }
      const hist = historyRef.current.slice(0, historyIndexRef.current + 1);
      if (hist[hist.length - 1] !== next) {
        hist.push(next);
        if (hist.length > 50) hist.shift();
        historyRef.current = hist;
        historyIndexRef.current = hist.length - 1;
      }
    },
    []
  );

  const applyChange = useCallback(
    (next: string) => {
      onChange(next);
      pushHistory(next);
    },
    [onChange, pushHistory]
  );

  const insert = useCallback(
    (action: string | InsertAction) => {
      const el = textareaRef.current;
      const { text, cursorBeforeEnd = 0 } =
        typeof action === "string" ? { text: action, cursorBeforeEnd: 0 } : action;

      if (!el) {
        applyChange(value + text);
        return;
      }

      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      const next = value.slice(0, start) + text + value.slice(end);
      applyChange(next);

      const cursorPos = start + text.length - cursorBeforeEnd;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(cursorPos, cursorPos);
      });
    },
    [value, applyChange]
  );

  const backspace = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start !== end) {
      applyChange(value.slice(0, start) + value.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start, start);
      });
      return;
    }
    if (start === 0) return;
    applyChange(value.slice(0, start - 1) + value.slice(start));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start - 1, start - 1);
    });
  }, [value, applyChange]);

  const moveCursor = useCallback((delta: number) => {
    const el = textareaRef.current;
    if (!el) return;
    const pos = (el.selectionStart ?? 0) + delta;
    const next = Math.max(0, Math.min(value.length, pos));
    el.focus();
    el.setSelectionRange(next, next);
  }, [value.length]);

  const clearAll = useCallback(() => {
    applyChange("");
    textareaRef.current?.focus();
  }, [applyChange]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    skipHistoryRef.current = true;
    onChange(historyRef.current[historyIndexRef.current]);
  }, [onChange]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    skipHistoryRef.current = true;
    onChange(historyRef.current[historyIndexRef.current]);
  }, [onChange]);

  useEffect(() => {
    if (historyRef.current.length === 1 && historyRef.current[0] === "" && value !== "") {
      historyRef.current = [value];
      historyIndexRef.current = 0;
    }
  }, [value]);

  const tpl = (text: string, cursorBeforeEnd = 0): InsertAction => ({ text, cursorBeforeEnd });

  const tabClass = (t: Tab) =>
    [
      "px-3 py-1.5 text-xs font-medium rounded-t transition-colors",
      tab === t ? "text-brand-700 border-b-2 border-brand-600 bg-white" : "text-slate-500 hover:text-slate-700",
    ].join(" ");

  return (
    <div className={`rounded-lg border border-slate-200 overflow-hidden bg-slate-100 ${className}`}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => applyChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        className="w-full bg-white border-b border-slate-200 px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 pt-1 bg-slate-100 border-b border-slate-200">
        <div className="flex">
          <button type="button" className={tabClass("main")} onClick={() => setTab("main")}>
            main
          </button>
          <button type="button" className={tabClass("abc")} onClick={() => setTab("abc")}>
            abc
          </button>
          <button type="button" className={tabClass("func")} onClick={() => setTab("func")}>
            func
          </button>
        </div>
        <div className="flex items-center gap-1 pb-1">
          <button
            type="button"
            onClick={undo}
            title="Undo"
            className="p-1.5 text-slate-500 hover:text-slate-800 rounded"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={redo}
            title="Redo"
            className="p-1.5 text-slate-500 hover:text-slate-800 rounded"
          >
            ↷
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800"
          >
            clear all
          </button>
        </div>
      </div>

      {/* Keypad */}
      <div className="p-1.5">
        {tab === "main" && (
          <div className="flex gap-1">
            {/* Left: functions */}
            <div className="grid grid-cols-3 gap-1 flex-[3]">
              <Key label={<span>a<sup>2</sup></span>} onClick={() => insert("^2")} />
              <Key label={<span>a<sup>b</sup></span>} onClick={() => insert("^")} />
              <Key label="|a|" onClick={() => insert(tpl("abs()", 1))} />
              <Key label="√" onClick={() => insert(tpl("sqrt()", 1))} />
              <Key label={<span><sup>n</sup>√</span>} onClick={() => insert(tpl("nthRoot(, )", 5))} />
              <Key label="π" onClick={() => insert("pi")} />
              <Key label="sin" onClick={() => insert(tpl("sin()", 1))} />
              <Key label="cos" onClick={() => insert(tpl("cos()", 1))} />
              <Key label="tan" onClick={() => insert(tpl("tan()", 1))} />
              <Key label="(" onClick={() => insert("(")} />
              <Key label=")" onClick={() => insert(")")} />
              <Key label="," onClick={() => insert(", ")} />
            </div>

            {/* Right: numbers + operators */}
            <div className="grid grid-cols-4 gap-1 flex-[4]">
              <GrayKey label="7" onClick={() => insert("7")} />
              <GrayKey label="8" onClick={() => insert("8")} />
              <GrayKey label="9" onClick={() => insert("9")} />
              <Key label="÷" onClick={() => insert(" / ")} />

              <GrayKey label="4" onClick={() => insert("4")} />
              <GrayKey label="5" onClick={() => insert("5")} />
              <GrayKey label="6" onClick={() => insert("6")} />
              <Key label="×" onClick={() => insert(" * ")} />

              <GrayKey label="1" onClick={() => insert("1")} />
              <GrayKey label="2" onClick={() => insert("2")} />
              <GrayKey label="3" onClick={() => insert("3")} />
              <Key label="−" onClick={() => insert(" - ")} />

              <GrayKey label="0" onClick={() => insert("0")} />
              <GrayKey label="." onClick={() => insert(".")} />
              <Key label="+" onClick={() => insert(" + ")} />
              <Key label="↵" onClick={() => insert("\n")} accent />

              <Key label="%" onClick={() => insert(" / 100")} className="text-xs" />
              <Key label="a/b" onClick={() => insert(tpl("( ) / ( )", 5))} className="text-xs" />
              <Key label="←" onClick={() => moveCursor(-1)} />
              <Key label="→" onClick={() => moveCursor(1)} />
              <GrayKey label="⌫" onClick={backspace} />
            </div>
          </div>
        )}

        {tab === "abc" && (
          <div className="space-y-1">
            {(shift ? ABC_ROWS_UPPER : ABC_ROWS_LOWER).map((row, ri) => (
              <div
                key={ri}
                className={`grid gap-1 ${ri === 1 ? "pl-3" : ri === 2 ? "pl-6" : ""}`}
                style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
              >
                {row.map((ch) => (
                  <Key key={ch} label={<span className="italic font-serif">{ch}</span>} onClick={() => insert(ch)} />
                ))}
              </div>
            ))}
            <div className="grid grid-cols-10 gap-1">
              <GrayKey label="⇧" onClick={() => setShift((s) => !s)} className={shift ? "bg-brand-100" : ""} />
              <Key label="=" onClick={() => insert(" = ")} />
              <Key label="(" onClick={() => insert("(")} />
              <Key label=")" onClick={() => insert(")")} />
              <Key label="[" onClick={() => insert("[")} />
              <Key label="]" onClick={() => insert("]")} />
              <Key label="!" onClick={() => insert("!")} />
              <Key label="'" onClick={() => insert("_")} />
              <Key label="π" onClick={() => insert("pi")} />
              <GrayKey label="⌫" onClick={backspace} />
              <Key label="," onClick={() => insert(", ")} />
              <Key label="." onClick={() => insert(".")} />
              <Key label=":" onClick={() => insert(":")} />
              <Key label=";" onClick={() => insert(";")} />
              <Key label="space" onClick={() => insert(" ")} wide className="col-span-4" />
              <Key label="↵" onClick={() => insert("\n")} accent wide className="col-span-2" />
            </div>
          </div>
        )}

        {tab === "func" && (
          <div className="grid grid-cols-6 gap-1">
            <Key label="sin" onClick={() => insert(tpl("sin()", 1))} />
            <Key label="cos" onClick={() => insert(tpl("cos()", 1))} />
            <Key label="tan" onClick={() => insert(tpl("tan()", 1))} />
            <Key label={<span>a<sup>b</sup></span>} onClick={() => insert("^")} />
            <Key label="√" onClick={() => insert(tpl("sqrt()", 1))} />
            <Key label={<span><sup>n</sup>√</span>} onClick={() => insert(tpl("nthRoot(, )", 5))} />

            <Key label="sin⁻¹" onClick={() => insert(tpl("asin()", 1))} className="text-xs" />
            <Key label="cos⁻¹" onClick={() => insert(tpl("acos()", 1))} className="text-xs" />
            <Key label="tan⁻¹" onClick={() => insert(tpl("atan()", 1))} className="text-xs" />
            <Key label="eˣ" onClick={() => insert(tpl("exp()", 1))} />
            <Key label="abs" onClick={() => insert(tpl("abs()", 1))} />
            <Key label="round" onClick={() => insert(tpl("round()", 1))} />

            <Key label="ln" onClick={() => insert(tpl("log()", 1))} />
            <Key label="log" onClick={() => insert(tpl("log10()", 1))} />
            <Key label="min" onClick={() => insert(tpl("min(, )", 4))} />
            <Key label="max" onClick={() => insert(tpl("max(, )", 4))} />
            <Key label="mean" onClick={() => insert(tpl("mean()", 1))} />
            <Key label="!" onClick={() => insert(tpl("factorial()", 1))} />

            <Key label="nPr" onClick={() => insert(tpl("permutations(, )", 14))} className="text-xs" />
            <Key label="nCr" onClick={() => insert(tpl("combinations(, )", 14))} className="text-xs" />
            <Key label="e" onClick={() => insert("e")} />
            <Key label="π" onClick={() => insert("pi")} />
            <GrayKey label="⌫" onClick={backspace} />
            <Key label="↵" onClick={() => insert("\n")} accent />
          </div>
        )}
      </div>
    </div>
  );
}
