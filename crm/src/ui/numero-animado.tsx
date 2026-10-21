"use client";

import { useEffect, useRef, useState } from "react";

/** Cuenta de 0 al valor en menos de un segundo. Con «reducir movimiento» muestra el valor de una vez. */
export function NumeroAnimado({ valor, duracion = 700 }: { valor: number; duracion?: number }) {
  const [mostrado, setMostrado] = useState(valor);
  const primera = useRef(true);

  useEffect(() => {
    if (!primera.current) {
      setMostrado(valor);
      return;
    }
    primera.current = false;
    if (valor === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cuadro = 0;
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      setMostrado(Math.round(valor * (1 - Math.pow(1 - t, 3))));
      if (t < 1) cuadro = requestAnimationFrame(paso);
    };
    setMostrado(0);
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [valor, duracion]);

  return <span className="tabular-nums">{mostrado}</span>;
}
