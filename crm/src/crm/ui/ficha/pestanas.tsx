"use client";

import clsx from "clsx";
import { useState, type ReactNode } from "react";

export function Pestanas({ pestanas, inicial }: { pestanas: { id: string; etiqueta: string; contenido: ReactNode }[]; inicial?: string }) {
  const [activa, setActiva] = useState(inicial ?? pestanas[0]?.id);
  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-slate-200 px-4">
        {pestanas.map((p) => (
          <button
            key={p.id}
            role="tab"
            type="button"
            aria-selected={activa === p.id}
            onClick={() => setActiva(p.id)}
            className={clsx(
              "-mb-px border-b-2 px-3 py-2.5 text-sm",
              activa === p.id ? "border-marca-600 font-semibold text-marca-800" : "border-transparent text-slate-600 hover:text-slate-900",
            )}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      {pestanas.map((p) => (
        <div key={p.id} role="tabpanel" hidden={activa !== p.id} className="p-4">
          {p.contenido}
        </div>
      ))}
    </div>
  );
}
