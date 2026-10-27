import assert from "node:assert/strict";
import { test } from "node:test";
import { esFechaValida } from "./fechas";

test("esFechaValida solo acepta fechas que existen", () => {
  for (const buena of ["2026-10-26", "2028-02-29", "0001-01-01", "9999-12-31"]) assert.equal(esFechaValida(buena), true, buena);
  for (const mala of ["2026-13-45", "2026-02-30", "2027-02-29", "2026-00-10", "2026-1-1", "26-10-2026", "no-fecha", "", "2026-10-26T10:00"]) {
    assert.equal(esFechaValida(mala), false, mala);
  }
});
