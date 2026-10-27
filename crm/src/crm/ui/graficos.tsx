"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatoMoneda, formatoNumero } from "../formato";

export const paleta = ["#ff6259", "var(--serie-marino)", "#2dd4a7", "#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7686", "#84cc16", "#06b6d4"];

export interface DatoGrafico {
  etiqueta: string;
  valor: number;
}

export function Grafico({
  datos,
  tipo,
  esMoneda,
  moneda = "COP",
  alto = 260,
}: {
  datos: DatoGrafico[];
  tipo: string;
  esMoneda?: boolean;
  moneda?: string;
  alto?: number;
}) {
  const formato = (v: number) => (esMoneda ? formatoMoneda(v, moneda) : formatoNumero(v));
  const corto = (v: number) =>
    esMoneda ? new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(v) : formatoNumero(v);
  if (datos.length === 0) return <p className="py-10 text-center text-sm text-slate-500">No hay datos para mostrar.</p>;

  if (tipo === "anillo") {
    const total = datos.reduce((s, d) => s + d.valor, 0);
    return (
      <div>
        <ResponsiveContainer width="100%" height={alto}>
          <PieChart>
            <Pie data={datos} dataKey="valor" nameKey="etiqueta" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
              {datos.map((d, i) => (
                <Cell key={d.etiqueta} fill={paleta[i % paleta.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: "var(--superficie)", border: "1px solid var(--color-slate-200)", borderRadius: 8, color: "var(--color-slate-800)" }} formatter={(v) => formato(Number(v))} />
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-700 text-sm font-semibold">
              {corto(total)}
            </text>
          </PieChart>
        </ResponsiveContainer>
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
          {datos.map((d, i) => (
            <li key={d.etiqueta} className="flex items-center gap-1.5 truncate">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: paleta[i % paleta.length] }} />
              <span className="truncate">{d.etiqueta}</span>
              <span className="ml-auto text-slate-400">{corto(d.valor)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (tipo === "linea") {
    return (
      <ResponsiveContainer width="100%" height={alto}>
        <LineChart data={datos} margin={{ left: 8, right: 16, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--rejilla)" />
          <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "var(--color-slate-500)" }} />
          <YAxis tickFormatter={corto} tick={{ fontSize: 11, fill: "var(--color-slate-500)" }} width={56} />
          <Tooltip contentStyle={{ background: "var(--superficie)", border: "1px solid var(--color-slate-200)", borderRadius: 8, color: "var(--color-slate-800)" }} formatter={(v) => formato(Number(v))} />
          <Line type="monotone" dataKey="valor" stroke={paleta[0]} strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  const horizontal = tipo === "barras";
  return (
    <ResponsiveContainer width="100%" height={Math.max(alto, horizontal ? datos.length * 34 + 30 : alto)}>
      <BarChart data={datos} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: 8, right: 16, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--rejilla)" />
        {horizontal ? (
          <>
            <XAxis type="number" tickFormatter={corto} tick={{ fontSize: 11, fill: "var(--color-slate-500)" }} />
            <YAxis type="category" dataKey="etiqueta" width={130} tick={{ fontSize: 11, fill: "var(--color-slate-500)" }} />
          </>
        ) : (
          <>
            <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "var(--color-slate-500)" }} />
            <YAxis tickFormatter={corto} tick={{ fontSize: 11, fill: "var(--color-slate-500)" }} width={56} />
          </>
        )}
        <Tooltip contentStyle={{ background: "var(--superficie)", border: "1px solid var(--color-slate-200)", borderRadius: 8, color: "var(--color-slate-800)" }} formatter={(v) => formato(Number(v))} cursor={{ fill: "var(--realce)" }} />
        <Bar dataKey="valor" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
          {datos.map((d, i) => (
            <Cell key={d.etiqueta} fill={paleta[i % paleta.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
