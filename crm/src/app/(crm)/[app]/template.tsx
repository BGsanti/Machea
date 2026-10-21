/** Un template se vuelve a montar en cada navegación: el contenido de cada página entra subiendo y apareciendo. */
export default function Plantilla({ children }: { children: React.ReactNode }) {
  return <div className="animate-subir">{children}</div>;
}
