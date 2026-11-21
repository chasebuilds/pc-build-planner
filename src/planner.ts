import { catalog as defaultCatalog } from "./catalog";
import { getProfile, type Profile } from "./profiles";
import { checkBuild, estimatedLoadW, PSU_HEADROOM, TIGHT_COOLER_MM, TIGHT_FIT_MM } from "./rules";
import type { Build, Case, Catalog, Cooler, Cpu, Gpu, Motherboard, Psu, Ram, Storage, UseCase } from "./types";

export type PlanResult =
  | { ok: true; build: Build; total: number; score: number }
  | { ok: false; message: string; minBudget: number | null };

export const emptyBuild = (): Build => ({
  cpu: null,
  motherboard: null,
  ram: null,
  gpu: null,
  storage: [],
  psu: null,
  case: null,
  cooler: null,
});

export function totalPrice(b: Build): number {
  return (
    (b.cpu?.price ?? 0) +
    (b.motherboard?.price ?? 0) +
    (b.ram?.price ?? 0) +
    (b.gpu?.price ?? 0) +
    b.storage.reduce((s, d) => s + d.price, 0) +
    (b.psu?.price ?? 0) +
    (b.case?.price ?? 0) +
    (b.cooler?.price ?? 0)
  );
}

const byPrice = <T extends { price: number }>(a: T, b: T): number => a.price - b.price;

interface Chassis {
  psu: Psu;
  case: Case;
  cooler: Cooler;
  price: number;
}

/** Cheapest PSU, case and cooler that give a build with no errors and no warnings. */
function pickChassis(cat: Catalog, cpu: Cpu, mb: Motherboard, gpu: Gpu | null): Chassis | null {
  const load = (cpu.tdp ?? 0) + (gpu?.tdp ?? 0) + 75;
  const psu = [...cat.psu].sort(byPrice).find((p) => p.watts >= Math.ceil(load * PSU_HEADROOM));
  if (!psu) return null;
  let best: Chassis | null = null;
  for (const c of cat.case) {
    if (!c.formFactors.includes(mb.formFactor)) continue;
    if (gpu && c.maxGpuMm - gpu.lengthMm < TIGHT_FIT_MM) continue;
    for (const k of cat.cooler) {
      if (!k.sockets.includes(cpu.socket)) continue;
      if (k.tdpRating < cpu.tdp) continue;
      if (c.maxCoolerMm - k.heightMm < TIGHT_COOLER_MM) continue;
      const price = psu.price + c.price + k.price;
      if (!best || price < best.price) best = { psu, case: c, cooler: k, price };
    }
  }
  return best;
}

function storageOptions(cat: Catalog, p: Profile): Storage[][] {
  const fit = cat.storage.filter((s) => s.capacityGb >= p.minStorageGb);
  return p.driveCount === 2 ? fit.map((s) => [s, s]) : fit.map((s) => [s]);
}

function scoreBuild(p: Profile, cpu: Cpu, gpu: Gpu | null, ram: Ram, drives: Storage[]): number {
  const cpuScore = cpu.perf / 100;
  const gpuScore = gpu ? gpu.perf / 100 : 0;
  const ramScore =
    Math.min(ram.capacityGb / p.targetRamGb, 1) * 0.8 + Math.min(ram.speed / (ram.type === "DDR5" ? 6000 : 3600), 1) * 0.2;
  const first = drives[0];
  // Two drives hold a copy of the same data, so usable capacity is one drive.
  const usable = first?.capacityGb ?? 0;
  const storageScore = Math.min(usable / p.targetStorageGb, 1) * 0.85 + (first?.interface === "NVMe" ? 0.15 : 0);
  const w = p.weights;
  return w.cpu * cpuScore + w.gpu * gpuScore + w.ram * ramScore + w.storage * storageScore;
}

export function planBuild(useCase: UseCase, budget: number, cat: Catalog = defaultCatalog): PlanResult {
  const p = getProfile(useCase);
  const drives = storageOptions(cat, p);
  const chassisCache = new Map<string, Chassis | null>();
  let best: { build: Build; total: number; score: number } | null = null;
  let cheapest: number | null = null;

  for (const cpu of cat.cpu) {
    if (cpu.cores < p.minCpuCores) continue;
    for (const mb of cat.motherboard) {
      if (mb.socket !== cpu.socket) continue;
      const gpuOptions: (Gpu | null)[] = p.needsGpu
        ? cat.gpu.filter((g) => g.perf >= p.minGpuPerf)
        : cpu.hasIgpu
          ? [null]
          : [...cat.gpu].sort(byPrice).slice(0, 1);
      for (const gpu of gpuOptions) {
        const key = `${cpu.id}|${mb.id}|${gpu?.id ?? "-"}`;
        if (!chassisCache.has(key)) chassisCache.set(key, pickChassis(cat, cpu, mb, gpu));
        const chassis = chassisCache.get(key);
        if (!chassis) continue;
        for (const ram of cat.ram) {
          if (ram.type !== mb.ramType || ram.speed > mb.maxRamSpeed) continue;
          if (ram.capacityGb < p.minRamGb) continue;
          for (const d of drives) {
            const build: Build = {
              cpu,
              motherboard: mb,
              ram,
              gpu,
              storage: d,
              psu: chassis.psu,
              case: chassis.case,
              cooler: chassis.cooler,
            };
            const total = totalPrice(build);
            if (cheapest === null || total < cheapest) {
              if (checkBuild(build).length === 0) cheapest = total;
            }
            if (total > budget) continue;
            const score = scoreBuild(p, cpu, gpu, ram, d);
            const better = !best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && total < best.total);
            if (better && checkBuild(build).length === 0) best = { build, total, score };
          }
        }
      }
    }
  }

  if (best) return { ok: true, ...best };
  return {
    ok: false,
    message:
      cheapest === null
        ? "No compatible build found for this use case."
        : `Budget is too low for ${p.label}. The cheapest compatible build in the catalog is about $${cheapest} (example prices).`,
    minBudget: cheapest,
  };
}

export type Reasons = Partial<Record<"cpu" | "motherboard" | "ram" | "gpu" | "storage" | "psu" | "case" | "cooler", string>>;

/** Plain-language reason for each part, computed from the build as it stands (so it updates after a swap). */
export function explainBuild(b: Build, useCase: UseCase): Reasons {
  const p = getProfile(useCase);
  const r: Reasons = {};
  const pct = (n: number): string => `${Math.round(n * 100)}%`;
  if (b.cpu) {
    const ok = b.cpu.cores >= p.minCpuCores;
    r.cpu = ok
      ? `${b.cpu.cores} cores meets the ${p.minCpuCores}-core floor for ${p.label.toLowerCase()}. CPU counts for ${pct(p.weights.cpu)} of the ranking here.`
      : `${b.cpu.cores} cores is below the ${p.minCpuCores}-core floor this use case aims for.`;
  }
  if (b.motherboard) {
    r.motherboard = `${b.motherboard.socket} socket matches the CPU. ${b.motherboard.formFactor} board with ${b.motherboard.ramType}, ${b.motherboard.m2Slots} M.2 slot${b.motherboard.m2Slots === 1 ? "" : "s"} and ${b.motherboard.sataPorts} SATA ports.`;
  }
  if (b.ram) {
    const ok = b.ram.capacityGb >= p.minRamGb;
    r.ram = ok
      ? `${b.ram.capacityGb} GB clears the ${p.minRamGb} GB floor (target ${p.targetRamGb} GB). Two sticks run in dual channel.`
      : `${b.ram.capacityGb} GB is under the ${p.minRamGb} GB floor for ${p.label.toLowerCase()}.`;
  }
  if (b.gpu) {
    r.gpu = p.needsGpu
      ? `${b.gpu.vramGb} GB card for ${p.label.toLowerCase()}. The GPU carries ${pct(p.weights.gpu)} of the ranking, so it gets the biggest share of the budget.`
      : `Added because the CPU has no integrated graphics. A basic card is enough here.`;
  } else if (b.cpu) {
    r.gpu = b.cpu.hasIgpu
      ? `No card. The CPU's integrated graphics cover ${p.label.toLowerCase()}, and the saving goes to other parts.`
      : `No card selected, and this CPU has no integrated graphics.`;
  }
  if (b.storage.length) {
    const d = b.storage[0];
    if (d) {
      const copy = b.storage.length > 1 ? ` A second identical drive holds a copy of the data (mirror or scheduled backup).` : "";
      r.storage = `${d.name} clears the ${p.minStorageGb} GB floor.${copy}`;
    }
  }
  if (b.psu && b.cpu) {
    const load = estimatedLoadW(b);
    r.psu = `Estimated load is ${load} W (CPU ${b.cpu.tdp} W, GPU ${b.gpu?.tdp ?? 0} W, 75 W for the rest). ${b.psu.watts} W gives ${Math.round((b.psu.watts / load - 1) * 100)}% headroom.`;
  }
  if (b.case && b.motherboard) {
    const spare = b.gpu ? ` ${b.case.maxGpuMm - b.gpu.lengthMm} mm to spare for the card.` : "";
    r.case = `Takes a ${b.motherboard.formFactor} board.${spare} Cheapest case that fits the parts.`;
  }
  if (b.cooler && b.cpu && b.case) {
    r.cooler = `Rated ${b.cooler.tdpRating} W for a ${b.cpu.tdp} W CPU. ${b.cooler.heightMm} mm tall, case allows ${b.case.maxCoolerMm} mm.`;
  }
  return r;
}
