const text = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean && clean.length <= 255 && !/^(unknown|n\/?a|none|-)$/i.test(clean) ? clean : undefined;
};

const positive = (value: unknown, unit = ""): string | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? `${value}${unit ? ` ${unit}` : ""}`
    : undefined;

const powerConnectors = (value: unknown): string | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const counts = value as Record<string, unknown>;
  const labels = {
    pcie_6_pin: "PCIe 6-pin",
    pcie_8_pin: "PCIe 8-pin",
    pcie_12VHPWR: "12VHPWR",
    pcie_12V_2x6: "12V-2x6",
  };
  const connectors = Object.entries(labels)
    .filter(([key]) => typeof counts[key] === "number" && Number.isInteger(counts[key]) && Number(counts[key]) > 0)
    .map(([key, label]) => `${counts[key]} × ${label}`);
  return connectors.join(", ") || undefined;
};

export const buildCoresNonCpuFields = (
  category: "GPU" | "RAM" | "Storage",
  item: Record<string, unknown>,
): Record<string, string> => {
  let values: Record<string, string | undefined>;
  switch (category) {
    case "GPU":
      values = {
        memoryGB: positive(item.memory, "GB"),
        lengthMM: positive(item.length, "mm"),
        slotWidth: positive(item.total_slot_width),
        tdp: positive(item.tdp, "W"),
        interface: text(item.interface),
        powerConnectors: powerConnectors(item.power_connectors),
      };
      break;
    case "RAM": {
      const modules = item.modules as { quantity?: unknown } | null | undefined;
      values = {
        memoryType: text(item.ram_type),
        capacityGB: positive(item.capacity, "GB"),
        modules: positive(modules?.quantity),
        speed: positive(item.speed, "MT/s"),
        formFactor: text(item.form_factor),
      };
      break;
    }
    case "Storage":
      values = {
        capacityGB: positive(item.capacity, "GB"),
        formFactor: text(item.form_factor),
        interface: text(item.interface),
        storageType: text(item.storage_type),
      };
      break;
  }
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined));
};
