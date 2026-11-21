import { catalog } from "../src/catalog";
import type { Build, Case, Cooler, Cpu, Gpu, Motherboard, Psu, Ram, Storage } from "../src/types";

function pick<T extends { id: string }>(list: T[], id: string): T {
  const found = list.find((p) => p.id === id);
  if (!found) throw new Error(`unknown part ${id}`);
  return found;
}

export const cpu = (id: string): Cpu => pick(catalog.cpu, id);
export const mb = (id: string): Motherboard => pick(catalog.motherboard, id);
export const ram = (id: string): Ram => pick(catalog.ram, id);
export const gpu = (id: string): Gpu => pick(catalog.gpu, id);
export const storage = (id: string): Storage => pick(catalog.storage, id);
export const psu = (id: string): Psu => pick(catalog.psu, id);
export const pcCase = (id: string): Case => pick(catalog.case, id);
export const cooler = (id: string): Cooler => pick(catalog.cooler, id);

/** A known-good AM5 gaming build with no warnings. */
export function goodBuild(): Build {
  return {
    cpu: cpu("cpu-am5-6c"),
    motherboard: mb("mb-am5-matx"),
    ram: ram("ram-d5-32f"),
    gpu: gpu("gpu-m12"),
    storage: [storage("sto-n1")],
    psu: psu("psu-650"),
    case: pcCase("case-atx"),
    cooler: cooler("cool-120"),
  };
}
