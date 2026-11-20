/**
 * PVP = (coste_CNY × tipo + envío_unitario) × (1 + arancel) × (1 + IVA_importación) × multiplicador
 * Redondeo psicológico al ,95 / ,99 más cercano por arriba y precio mínimo.
 *
 * El IVA de importación se incluye como coste para simplificar; si eres
 * sujeto pasivo y lo deduces, ponlo a 0 en la config. Los valores por defecto
 * son SUPUESTOS: revísalos con tu agente y tu gestor.
 */
export function landedCost(costCny, p) {
  const base = costCny * p.cny_to_eur + p.shipping_per_unit_eur;
  return base * (1 + p.import_duty_rate) * (1 + p.import_vat_rate);
}

export function roundPsychological(value, endings = [0.95, 0.99]) {
  const whole = Math.floor(value);
  const candidates = [];
  for (const w of [whole - 1, whole, whole + 1]) {
    for (const e of endings) candidates.push(+(w + e).toFixed(2));
  }
  return candidates.filter((c) => c >= value).sort((a, b) => a - b)[0];
}

export function suggestPrice(costCny, p) {
  if (!Number.isFinite(costCny) || costCny <= 0) return null;
  const raw = landedCost(costCny, p) * p.multiplier;
  return Math.max(p.min_price_eur, roundPsychological(raw, p.round_to));
}

export function marginReport(priceEur, costCny, p) {
  const cost = landedCost(costCny, p);
  const net = priceEur / 1.21; // precio sin IVA español de venta
  return {
    landed_cost_eur: +cost.toFixed(2),
    net_price_eur: +net.toFixed(2),
    gross_margin_eur: +(net - cost).toFixed(2),
    gross_margin_pct: +(((net - cost) / net) * 100).toFixed(1),
  };
}
