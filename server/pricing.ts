/**
 * Evergreen Design/Build — Pricing Configuration
 *
 * EDIT THIS FILE to update pricing. No other code changes required.
 * All prices in USD. Square-foot rates include labor + standard materials.
 *
 * The estimator returns a budget RANGE (low / likely / high), not a fixed quote.
 * Low end uses base rate; likely applies modifiers; high adds contingency.
 */

export type ProjectCategoryKey =
  | "paver_patio"
  | "natural_stone_patio"
  | "concrete_patio"
  | "lawn_install"
  | "planting_beds"
  | "retaining_wall"
  | "irrigation"
  | "landscape_lighting"
  | "drainage"
  | "outdoor_kitchen"
  | "fire_feature"
  | "water_feature"
  | "fence"
  | "pergola_structure"
  | "tree_install"
  | "mulch_refresh";

export interface CategoryRate {
  label: string;
  unit: "sqft" | "linear_ft" | "each" | "lump_sum";
  basePerUnit: number;
  likelyPerUnit: number;
  minProject: number;
  notes?: string;
}

export interface PricingConfig {
  company: {
    name: string;
    serviceArea: string;
    designFee: number;
    contingencyPct: number;
    minTotalProject: number;
    salesTaxPct: number;
  };
  categories: Record<ProjectCategoryKey, CategoryRate>;
  materialMultipliers: {
    standard: number;
    premium: number;
    luxury: number;
  };
  siteModifiers: {
    steep_slope: number;
    poor_access: number;
    demolition_required: number;
    permit_required: number;
    hoa_requirements: number;
  };
  timelineModifiers: {
    rush_under_30_days: number;
    flexible_off_season: number;
  };
}

export const pricing: PricingConfig = {
  company: {
    name: "Evergreen Design/Build",
    serviceArea: "Naples & Southwest Florida",
    designFee: 1200,
    contingencyPct: 0.18,
    minTotalProject: 3500,
    salesTaxPct: 0.07,
  },
  categories: {
    paver_patio: {
      label: "Paver Patio",
      unit: "sqft",
      basePerUnit: 18,
      likelyPerUnit: 24,
      minProject: 3500,
      notes: "Includes excavation, base prep, sand, standard concrete pavers, polymeric sand.",
    },
    natural_stone_patio: {
      label: "Natural Stone Patio",
      unit: "sqft",
      basePerUnit: 32,
      likelyPerUnit: 45,
      minProject: 5000,
      notes: "Travertine, flagstone, or bluestone. Includes set bed and joint material.",
    },
    concrete_patio: {
      label: "Poured Concrete Patio",
      unit: "sqft",
      basePerUnit: 12,
      likelyPerUnit: 16,
      minProject: 2800,
    },
    lawn_install: {
      label: "Sod / Lawn Install",
      unit: "sqft",
      basePerUnit: 1.6,
      likelyPerUnit: 2.4,
      minProject: 1500,
      notes: "Grade prep + St. Augustine or Zoysia sod.",
    },
    planting_beds: {
      label: "Planting Beds (design + install)",
      unit: "sqft",
      basePerUnit: 14,
      likelyPerUnit: 22,
      minProject: 2000,
      notes: "Soil amendment, edging, mid-size shrubs, perennials, mulch.",
    },
    retaining_wall: {
      label: "Retaining Wall",
      unit: "linear_ft",
      basePerUnit: 95,
      likelyPerUnit: 145,
      minProject: 4500,
      notes: "Per linear foot, assumes wall up to 3 ft tall. Taller walls require engineering.",
    },
    irrigation: {
      label: "Irrigation System",
      unit: "sqft",
      basePerUnit: 1.1,
      likelyPerUnit: 1.6,
      minProject: 2500,
      notes: "Per sq ft of coverage area. Includes controller, valves, heads, drip lines.",
    },
    landscape_lighting: {
      label: "Landscape Lighting",
      unit: "each",
      basePerUnit: 220,
      likelyPerUnit: 320,
      minProject: 1800,
      notes: "Per fixture, includes transformer share, wire, install. LED low-voltage.",
    },
    drainage: {
      label: "Drainage / French Drain",
      unit: "linear_ft",
      basePerUnit: 38,
      likelyPerUnit: 55,
      minProject: 1800,
    },
    outdoor_kitchen: {
      label: "Outdoor Kitchen",
      unit: "lump_sum",
      basePerUnit: 18000,
      likelyPerUnit: 32000,
      minProject: 18000,
      notes: "Lump sum baseline; varies heavily by appliances and counter material.",
    },
    fire_feature: {
      label: "Fire Pit / Fireplace",
      unit: "lump_sum",
      basePerUnit: 3200,
      likelyPerUnit: 8500,
      minProject: 3200,
    },
    water_feature: {
      label: "Water Feature",
      unit: "lump_sum",
      basePerUnit: 4500,
      likelyPerUnit: 12000,
      minProject: 4500,
    },
    fence: {
      label: "Fence",
      unit: "linear_ft",
      basePerUnit: 42,
      likelyPerUnit: 65,
      minProject: 2500,
    },
    pergola_structure: {
      label: "Pergola / Shade Structure",
      unit: "lump_sum",
      basePerUnit: 6500,
      likelyPerUnit: 14000,
      minProject: 6500,
    },
    tree_install: {
      label: "Tree Install (mature)",
      unit: "each",
      basePerUnit: 450,
      likelyPerUnit: 950,
      minProject: 900,
      notes: "Per tree, 15-30 gal container. Larger specimens priced individually.",
    },
    mulch_refresh: {
      label: "Mulch Refresh",
      unit: "sqft",
      basePerUnit: 0.65,
      likelyPerUnit: 0.95,
      minProject: 600,
    },
  },
  materialMultipliers: {
    standard: 1.0,
    premium: 1.25,
    luxury: 1.6,
  },
  siteModifiers: {
    steep_slope: 0.15,
    poor_access: 0.12,
    demolition_required: 0.10,
    permit_required: 850,
    hoa_requirements: 0.05,
  },
  timelineModifiers: {
    rush_under_30_days: 0.12,
    flexible_off_season: -0.06,
  },
};

// Estimator engine

export interface LineItemInput {
  category: ProjectCategoryKey;
  quantity: number;
  materialTier?: "standard" | "premium" | "luxury";
  notes?: string;
}

export interface EstimateInput {
  lineItems: LineItemInput[];
  site?: {
    steep_slope?: boolean;
    poor_access?: boolean;
    demolition_required?: boolean;
    permit_required?: boolean;
    hoa_requirements?: boolean;
  };
  timeline?: "rush" | "standard" | "flexible";
}

export interface LineItemResult {
  category: ProjectCategoryKey;
  label: string;
  quantity: number;
  unit: string;
  materialTier: string;
  low: number;
  likely: number;
  high: number;
}

export interface EstimateResult {
  lineItems: LineItemResult[];
  subtotal: { low: number; likely: number; high: number };
  designFee: number;
  siteAdjustments: { label: string; amount: number }[];
  timelineAdjustment: { label: string; amount: number } | null;
  total: { low: number; likely: number; high: number };
  notes: string[];
  companyName: string;
}

export function computeEstimate(input: EstimateInput): EstimateResult {
  const notes: string[] = [];
  const lineItems: LineItemResult[] = [];
  let subLow = 0;
  let subLikely = 0;

  for (const li of input.lineItems) {
    const cat = pricing.categories[li.category];
    if (!cat) continue;
    const tier = li.materialTier ?? "standard";
    const mult = pricing.materialMultipliers[tier];
    let low: number;
    let likely: number;
    if (cat.unit === "lump_sum") {
      low = cat.basePerUnit * mult;
      likely = cat.likelyPerUnit * mult;
    } else {
      low = cat.basePerUnit * li.quantity * mult;
      likely = cat.likelyPerUnit * li.quantity * mult;
    }
    if (low < cat.minProject) low = cat.minProject;
    if (likely < cat.minProject) likely = cat.minProject;
    const high = likely * (1 + pricing.company.contingencyPct);
    lineItems.push({
      category: li.category,
      label: cat.label,
      quantity: li.quantity,
      unit: cat.unit,
      materialTier: tier,
      low: Math.round(low),
      likely: Math.round(likely),
      high: Math.round(high),
    });
    subLow += low;
    subLikely += likely;
  }

  const siteAdjustments: { label: string; amount: number }[] = [];
  let siteMultiplier = 0;
  let siteFlat = 0;
  if (input.site?.steep_slope) { siteMultiplier += pricing.siteModifiers.steep_slope; siteAdjustments.push({ label: "Steep slope work", amount: 0 }); }
  if (input.site?.poor_access) { siteMultiplier += pricing.siteModifiers.poor_access; siteAdjustments.push({ label: "Limited site access", amount: 0 }); }
  if (input.site?.demolition_required) { siteMultiplier += pricing.siteModifiers.demolition_required; siteAdjustments.push({ label: "Demolition / removal", amount: 0 }); }
  if (input.site?.hoa_requirements) { siteMultiplier += pricing.siteModifiers.hoa_requirements; siteAdjustments.push({ label: "HOA approval & compliance", amount: 0 }); }
  if (input.site?.permit_required) { siteFlat += pricing.siteModifiers.permit_required; siteAdjustments.push({ label: "Permitting", amount: pricing.siteModifiers.permit_required }); }

  const siteLow = subLow * siteMultiplier;
  const siteLikely = subLikely * siteMultiplier;
  if (siteMultiplier > 0) {
    const idx = siteAdjustments.findIndex((s) => s.amount === 0);
    if (idx >= 0) {
      siteAdjustments[idx].amount = Math.round(siteLikely);
      const extra = siteAdjustments.filter((s, i) => i !== idx && s.amount === 0);
      if (extra.length > 0) {
        siteAdjustments[idx].label += extra.map((e) => ` + ${e.label.toLowerCase()}`).join("");
        for (let i = siteAdjustments.length - 1; i >= 0; i--) {
          if (i !== idx && siteAdjustments[i].amount === 0) siteAdjustments.splice(i, 1);
        }
      }
    }
  }

  let timelineAdjustment: { label: string; amount: number } | null = null;
  let timelineMultiplier = 0;
  if (input.timeline === "rush") {
    timelineMultiplier = pricing.timelineModifiers.rush_under_30_days;
    timelineAdjustment = { label: "Rush schedule (under 30 days)", amount: Math.round(subLikely * timelineMultiplier) };
  } else if (input.timeline === "flexible") {
    timelineMultiplier = pricing.timelineModifiers.flexible_off_season;
    timelineAdjustment = { label: "Flexible timing discount", amount: Math.round(subLikely * timelineMultiplier) };
  }

  const timelineLow = subLow * timelineMultiplier;
  const timelineLikely = subLikely * timelineMultiplier;
  const designFee = pricing.company.designFee;

  let totalLow = subLow + siteLow + timelineLow + siteFlat + designFee;
  let totalLikely = subLikely + siteLikely + timelineLikely + siteFlat + designFee;
  let totalHigh = totalLikely * (1 + pricing.company.contingencyPct);

  if (totalLow < pricing.company.minTotalProject) {
    notes.push(`Company minimum project size is $${pricing.company.minTotalProject.toLocaleString()}.`);
    totalLow = pricing.company.minTotalProject;
    totalLikely = Math.max(totalLikely, pricing.company.minTotalProject);
    totalHigh = Math.max(totalHigh, pricing.company.minTotalProject);
  }

  notes.push(`Range includes ${Math.round(pricing.company.contingencyPct * 100)}% contingency on the high end. Final quote requires an on-site visit.`);

  return {
    lineItems,
    subtotal: { low: Math.round(subLow), likely: Math.round(subLikely), high: Math.round(subLikely * (1 + pricing.company.contingencyPct)) },
    designFee,
    siteAdjustments,
    timelineAdjustment,
    total: { low: Math.round(totalLow), likely: Math.round(totalLikely), high: Math.round(totalHigh) },
    notes,
    companyName: pricing.company.name,
  };
}
