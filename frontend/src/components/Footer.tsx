import { macheaOffer } from "../lib/offerConfig";
import { Logo } from "./Logo";

const columnas = [
  {
    title: "Producto",
    links: [
      { href: "#como-funciona", label: "Cómo funciona" },
      { href: "#demos", label: "Beneficios" },
      { href: "#precios", label: "Precios" },
      { href: "#pruebalo", label: "Pruébalo tú mismo" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { href: "#origen", label: "Por qué Machea" },
      { href: "#faq", label: "Preguntas frecuentes" },
      { href: "#oferta", label: macheaOffer.ctaText },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-navy pb-8 pt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 pb-12 md:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <Logo size={32} variant="mono" />
            <p className="mt-4 max-w-xs text-sm text-white/50">
              Machea perfila, contacta con IA en segundos y entrega leads listos para comprar a tus asesores —
              sin que tú o tu equipo técnico muevan un dedo.
            </p>
          </div>

          {columnas.map((col) => (
            <div key={col.title}>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-white/40">{col.title}</p>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-white/70 transition-colors hover:text-white">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 md:flex-row">
          <p className="text-xs text-white/40">© 2026 Machea Proptech. Todos los derechos reservados.</p>
          <p className="text-xs text-white/40">Hecho por el equipo de Machea · Colombia</p>
        </div>
      </div>
    </footer>
  );
}
