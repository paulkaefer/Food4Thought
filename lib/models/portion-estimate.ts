/** Portion size for a FoodItem: either a confident exact amount, or an approximate range. */
export interface PortionEstimate {
  amount: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  unit: string;
  /** true whenever range fields are used, or hidden ingredients reduce certainty */
  isApproximate: boolean;
  /** set when portion size could not be reliably determined at all (FR-011) */
  portionConfidenceWarning: string | null;
}

export function exactPortion(amount: number, unit = "g"): PortionEstimate {
  return { amount, rangeMin: null, rangeMax: null, unit, isApproximate: false, portionConfidenceWarning: null };
}

export function approximatePortion(rangeMin: number, rangeMax: number, unit = "g"): PortionEstimate {
  return { amount: null, rangeMin, rangeMax, unit, isApproximate: true, portionConfidenceWarning: null };
}

export function unreliablePortion(unit = "g"): PortionEstimate {
  return {
    amount: null,
    rangeMin: null,
    rangeMax: null,
    unit,
    isApproximate: true,
    portionConfidenceWarning: "Portion size could not be reliably determined from this photo.",
  };
}
