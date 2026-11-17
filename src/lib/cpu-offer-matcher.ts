import type { CatalogComponent } from "../types/catalog.ts";

type CpuBrand = "amd" | "intel";
type CpuFamily = "ryzen" | "core" | "core-ultra";

interface CpuModel {
  brand: CpuBrand;
  family: CpuFamily;
  tier: string;
  number: string;
  suffix: string;
}

export interface CpuOfferMatcher {
  supported: boolean;
  modelKey: string | null;
  reason: "unsupported_model" | "ambiguous_model" | null;
  matchesTitle(title: string): boolean;
}

const AMD_SUFFIXES = new Set(["", "G", "GE", "H", "HS", "HX", "PRO", "U", "X", "XT", "X3D"]);
const INTEL_SUFFIXES = new Set(["", "E", "F", "H", "HK", "HX", "K", "KF", "KS", "P", "T", "U", "V"]);

const fold = (value: string): string => value
  .replace(/[Łł]/g, "L")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleUpperCase("en-US")
  .replace(/[–—−]/g, "-")
  .replace(/[^A-Z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

const modelKey = (model: CpuModel): string => [model.brand, model.family, model.tier, model.number, model.suffix].join(":");

const extractModelCodes = (value: string): string[] => {
  const text = fold(value);
  const code = /\b(\d{4,5})\s*(X3D|XT|PRO|GE|HS|HX|KF|KS|K|F|G|H|P|T|U|E|V)\b/g;
  return [...text.matchAll(code)].map((match) => `${match[1]}${match[2]}`);
};

const parseModels = (value: string): CpuModel[] => {
  const text = fold(value);
  const result: CpuModel[] = [];
  const amd = /\bRYZEN\s+([3579])\s+(\d{4,5})\s*(X3D|XT|PRO|GE|HS|HX|G|H|U|X)?\b/g;
  for (const match of text.matchAll(amd)) {
    const suffix = match[3] ?? "";
    if (AMD_SUFFIXES.has(suffix)) result.push({ brand: "amd", family: "ryzen", tier: match[1], number: match[2], suffix });
  }

  const coreUltra = /\bCORE\s+ULTRA\s+([3579])\s+(\d{3,5})\s*(HX|HK|K|F|H|T|U|V)?\b/g;
  for (const match of text.matchAll(coreUltra)) {
    const suffix = match[3] ?? "";
    if (INTEL_SUFFIXES.has(suffix)) result.push({ brand: "intel", family: "core-ultra", tier: match[1], number: match[2], suffix });
  }

  // Some sellers omit the word "Core"; the i3/i5/i7/i9 tier is still a
  // useful, bounded identifier when it is followed by a full model number.
  const core = /\b(?:CORE\s+)?(I[3579])\s+(\d{4,5})\s*(KF|KS|HX|HK|K|F|H|P|T|U|E|V)?\b/g;
  for (const match of text.matchAll(core)) {
    const suffix = match[3] ?? "";
    if (INTEL_SUFFIXES.has(suffix)) result.push({ brand: "intel", family: "core", tier: match[1].slice(1), number: match[2], suffix });
  }
  return result;
};

const hasContradictoryBrand = (title: string, expected: CpuModel): boolean => {
  const text = fold(title);
  if (expected.brand === "amd" && /\bINTEL\b|\bCORE\s+(?:I[3579]|ULTRA\s+[3579])\b/.test(text)) return true;
  if (expected.brand === "intel" && /\bAMD\b|\bRYZEN\b/.test(text)) return true;
  return false;
};

const hasUnsafeListingSignal = (title: string): boolean => {
  const text = fold(title);
  return /\b(?:CHLODZ(?:ENIE|EN)|COOLER|COOLING|WENTYLATOR|FAN|RADIATOR|PLYTA|MOTHERBOARD|MAINBOARD|BRACKET|PASTA|THERMAL\s+PASTE|ZESTAW|BUNDLE|KIT|KOMPUTER|COMPUTER|DESKTOP|LAPTOP|NOTEBOOK|PC|SSD|HDD|NVME|DYSK|BEZ\s+PROCESORA|WITHOUT\s+CPU|PUDELKO|BOX\s+ONLY|ATRAPA|DUMMY|USZKODZ|NAPRAW|REPAIR|2X|\d+\s*SZT|MULTIPACK|DUOPACK|DWUPAK|PARA)\b|\b(?:[2-9]|[1-9]\d+)\s*X\s+(?:PROCESOR|CPU|AMD|INTEL|RYZEN|CORE)\b/.test(text)
    || /\b\d+\s*(?:GB|TB)\s*(?:RAM|PAMI[EĘ]CI|MEMORY|DDR\d+)\b|\b(?:RAM|PAMI[EĘ]CI|MEMORY)\s*\d+\s*(?:GB|TB)\b/.test(text)
    || /\b[ZBH]\d{3}\b/.test(text);
};

const parseTarget = (component: Pick<CatalogComponent, "name" | "manufacturer" | "model">): CpuModel | null => {
  const models = parseModels(`${component.name} ${component.model}`);
  const uniqueModels = [...new Map(models.map((model) => [modelKey(model), model])).values()];
  if (uniqueModels.length !== 1) return null;
  const target = uniqueModels[0];
  const manufacturer = fold(component.manufacturer);
  if (target.brand === "amd" && manufacturer && !manufacturer.includes("AMD")) return null;
  if (target.brand === "intel" && manufacturer && !manufacturer.includes("INTEL")) return null;
  return target;
};

export const createCpuOfferMatcher = (component: Pick<CatalogComponent, "name" | "manufacturer" | "model">): CpuOfferMatcher => {
  const target = parseTarget(component);
  if (!target) return { supported: false, modelKey: null, reason: "unsupported_model", matchesTitle: () => false };
  const key = modelKey(target);
  return {
    supported: true,
    modelKey: key,
    reason: null,
    matchesTitle(title: string): boolean {
      if (!title.trim() || hasUnsafeListingSignal(title) || hasContradictoryBrand(title, target)) return false;
      const models = parseModels(title);
      if (models.length !== 1) return false;
      const candidate = models[0];
      if (modelKey(candidate) !== key) return false;
      const codes = [...new Set(extractModelCodes(title))];
      return codes.length <= 1 && (codes.length === 0 || codes[0] === `${target.number}${target.suffix}`);
    },
  };
};

export const matchCpuOfferTitle = (
  component: Pick<CatalogComponent, "name" | "manufacturer" | "model">,
  title: string,
): boolean => createCpuOfferMatcher(component).matchesTitle(title);

