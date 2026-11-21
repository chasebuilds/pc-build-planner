import type { Build, Issue } from "./types";

/** Watts reserved for fans, drives, board and USB devices. */
export const OTHER_LOAD_W = 75;
/** PSU rating should be at least this multiple of estimated load. */
export const PSU_HEADROOM = 1.25;
/** Space left under this many mm is reported as a tight fit. */
export const TIGHT_FIT_MM = 10;
/** Cooler clearance below this many mm is reported as a tight fit. */
export const TIGHT_COOLER_MM = 5;

export interface Rule {
  id: string;
  title: string;
  check: (b: Build) => Issue[];
}

const err = (rule: string, message: string): Issue => ({ rule, severity: "error", message });
const warn = (rule: string, message: string): Issue => ({ rule, severity: "warning", message });

export function estimatedLoadW(b: Build): number {
  return (b.cpu?.tdp ?? 0) + (b.gpu?.tdp ?? 0) + OTHER_LOAD_W;
}

export const rules: Rule[] = [
  {
    id: "complete",
    title: "Required parts present",
    check: (b) => {
      const missing: string[] = [];
      if (!b.cpu) missing.push("CPU");
      if (!b.motherboard) missing.push("motherboard");
      if (!b.ram) missing.push("RAM");
      if (b.storage.length === 0) missing.push("storage");
      if (!b.psu) missing.push("power supply");
      if (!b.case) missing.push("case");
      if (!b.cooler) missing.push("CPU cooler");
      return missing.length ? [err("complete", `Missing: ${missing.join(", ")}.`)] : [];
    },
  },
  {
    id: "socket",
    title: "CPU socket matches motherboard",
    check: ({ cpu, motherboard }) =>
      cpu && motherboard && cpu.socket !== motherboard.socket
        ? [err("socket", `CPU is ${cpu.socket} but the motherboard is ${motherboard.socket}. They will not fit.`)]
        : [],
  },
  {
    id: "ram-type",
    title: "RAM type matches motherboard",
    check: ({ ram, motherboard }) =>
      ram && motherboard && ram.type !== motherboard.ramType
        ? [err("ram-type", `RAM is ${ram.type} but the motherboard takes ${motherboard.ramType}.`)]
        : [],
  },
  {
    id: "ram-speed",
    title: "RAM speed within motherboard limit",
    check: ({ ram, motherboard }) =>
      ram && motherboard && ram.type === motherboard.ramType && ram.speed > motherboard.maxRamSpeed
        ? [
            warn(
              "ram-speed",
              `RAM is rated ${ram.speed} MT/s but the board tops out at ${motherboard.maxRamSpeed}. It will run slower.`,
            ),
          ]
        : [],
  },
  {
    id: "ram-slots",
    title: "RAM sticks and capacity fit the board",
    check: ({ ram, motherboard }) => {
      if (!ram || !motherboard) return [];
      const out: Issue[] = [];
      if (ram.sticks > motherboard.ramSlots)
        out.push(err("ram-slots", `Kit has ${ram.sticks} sticks but the board has ${motherboard.ramSlots} slots.`));
      if (ram.capacityGb > motherboard.maxRamGb)
        out.push(err("ram-slots", `Kit is ${ram.capacityGb} GB but the board supports ${motherboard.maxRamGb} GB.`));
      return out;
    },
  },
  {
    id: "case-form",
    title: "Motherboard fits the case",
    check: ({ motherboard, case: pcCase }) =>
      motherboard && pcCase && !pcCase.formFactors.includes(motherboard.formFactor)
        ? [err("case-form", `Board is ${motherboard.formFactor} but the case only takes ${pcCase.formFactors.join(", ")}.`)]
        : [],
  },
  {
    id: "gpu-length",
    title: "Graphics card fits the case",
    check: ({ gpu, case: pcCase }) => {
      if (!gpu || !pcCase) return [];
      const spare = pcCase.maxGpuMm - gpu.lengthMm;
      if (spare < 0)
        return [err("gpu-length", `Card is ${gpu.lengthMm} mm long but the case allows ${pcCase.maxGpuMm} mm.`)];
      if (spare < TIGHT_FIT_MM)
        return [warn("gpu-length", `Card is a tight fit: ${spare} mm to spare. Check cable clearance.`)];
      return [];
    },
  },
  {
    id: "gpu-present",
    title: "Display output available",
    check: ({ cpu, gpu }) =>
      cpu && !gpu && !cpu.hasIgpu
        ? [
            err(
              "gpu-present",
              "This CPU has no integrated graphics and no graphics card is selected. There would be no display output.",
            ),
          ]
        : [],
  },
  {
    id: "psu-wattage",
    title: "PSU covers load with headroom",
    check: (b) => {
      if (!b.psu || !b.cpu) return [];
      const load = estimatedLoadW(b);
      if (b.psu.watts < load) return [err("psu-wattage", `Estimated load is ${load} W but the PSU is ${b.psu.watts} W.`)];
      const want = Math.ceil(load * PSU_HEADROOM);
      if (b.psu.watts < want)
        return [
          warn(
            "psu-wattage",
            `Estimated load is ${load} W. A ${b.psu.watts} W PSU leaves little headroom; aim for ${want} W or more.`,
          ),
        ];
      return [];
    },
  },
  {
    id: "cooler-height",
    title: "Cooler fits the case",
    check: ({ cooler, case: pcCase }) => {
      if (!cooler || !pcCase) return [];
      const spare = pcCase.maxCoolerMm - cooler.heightMm;
      if (spare < 0)
        return [err("cooler-height", `Cooler is ${cooler.heightMm} mm tall but the case allows ${pcCase.maxCoolerMm} mm.`)];
      if (spare < TIGHT_COOLER_MM) return [warn("cooler-height", `Cooler is a tight fit: ${spare} mm to spare.`)];
      return [];
    },
  },
  {
    id: "cooler-socket",
    title: "Cooler mounts on the CPU socket",
    check: ({ cooler, cpu }) =>
      cooler && cpu && !cooler.sockets.includes(cpu.socket)
        ? [err("cooler-socket", `Cooler does not list ${cpu.socket} mounting. It supports ${cooler.sockets.join(", ")}.`)]
        : [],
  },
  {
    id: "cooler-capacity",
    title: "Cooler rated for CPU heat",
    check: ({ cooler, cpu }) =>
      cooler && cpu && cooler.tdpRating < cpu.tdp
        ? [warn("cooler-capacity", `Cooler is rated ${cooler.tdpRating} W but the CPU is ${cpu.tdp} W. Expect throttling under load.`)]
        : [],
  },
  {
    id: "storage-interface",
    title: "Drives have a free port",
    check: ({ storage, motherboard }) => {
      if (!motherboard) return [];
      const out: Issue[] = [];
      const nvme = storage.filter((s) => s.interface === "NVMe").length;
      const sata = storage.length - nvme;
      if (nvme > motherboard.m2Slots)
        out.push(err("storage-interface", `${nvme} NVMe drives selected but the board has ${motherboard.m2Slots} M.2 slots.`));
      if (sata > motherboard.sataPorts)
        out.push(err("storage-interface", `${sata} SATA drives selected but the board has ${motherboard.sataPorts} SATA ports.`));
      return out;
    },
  },
];

export function checkBuild(build: Build): Issue[] {
  return rules.flatMap((r) => r.check(build));
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
