import type { UseCase } from "./types";

export interface Profile {
  id: UseCase;
  label: string;
  summary: string;
  /** Relative weight of each factor when ranking builds. Sums to 1. */
  weights: { cpu: number; gpu: number; ram: number; storage: number };
  minRamGb: number;
  /** RAM beyond this adds no score. */
  targetRamGb: number;
  minStorageGb: number;
  targetStorageGb: number;
  needsGpu: boolean;
  minGpuPerf: number;
  minCpuCores: number;
  /** Number of drives to fit. Servers get a second drive for a copy of the data. */
  driveCount: 1 | 2;
  note: string;
}

export const profiles: Profile[] = [
  {
    id: "office",
    label: "Office",
    summary: "Documents, browser tabs, video calls. No graphics card needed.",
    weights: { cpu: 0.4, gpu: 0, ram: 0.3, storage: 0.3 },
    minRamGb: 16,
    targetRamGb: 32,
    minStorageGb: 500,
    targetStorageGb: 1000,
    needsGpu: false,
    minGpuPerf: 0,
    minCpuCores: 4,
    driveCount: 1,
    note: "Integrated graphics are enough, so the money goes to a fast SSD and enough memory.",
  },
  {
    id: "home-office",
    label: "Home office",
    summary: "Heavy multitasking, spreadsheets, light photo editing, two monitors.",
    weights: { cpu: 0.4, gpu: 0.05, ram: 0.3, storage: 0.25 },
    minRamGb: 16,
    targetRamGb: 32,
    minStorageGb: 1000,
    targetStorageGb: 2000,
    needsGpu: false,
    minGpuPerf: 0,
    minCpuCores: 6,
    driveCount: 1,
    note: "Six or more cores and 1 TB of storage so many apps stay open without slowing down.",
  },
  {
    id: "gaming-1080p",
    label: "Gaming, 1080p",
    summary: "Modern games at 1920x1080 with high settings.",
    weights: { cpu: 0.25, gpu: 0.55, ram: 0.1, storage: 0.1 },
    minRamGb: 16,
    targetRamGb: 32,
    minStorageGb: 1000,
    targetStorageGb: 1000,
    needsGpu: true,
    minGpuPerf: 40,
    minCpuCores: 6,
    driveCount: 1,
    note: "Most of the budget goes to the graphics card, the part that sets frame rate.",
  },
  {
    id: "gaming-1440p",
    label: "Gaming, 1440p",
    summary: "Modern games at 2560x1440 with high settings.",
    weights: { cpu: 0.25, gpu: 0.55, ram: 0.1, storage: 0.1 },
    minRamGb: 32,
    targetRamGb: 32,
    minStorageGb: 1000,
    targetStorageGb: 2000,
    needsGpu: true,
    minGpuPerf: 60,
    minCpuCores: 6,
    driveCount: 1,
    note: "A 12 GB or larger graphics card and a CPU that will not hold it back.",
  },
  {
    id: "video-editing",
    label: "Video editing",
    summary: "4K timelines, exports and color work.",
    weights: { cpu: 0.35, gpu: 0.25, ram: 0.2, storage: 0.2 },
    minRamGb: 32,
    targetRamGb: 64,
    minStorageGb: 2000,
    targetStorageGb: 4000,
    needsGpu: true,
    minGpuPerf: 45,
    minCpuCores: 8,
    driveCount: 1,
    note: "Many cores for exports, 32 GB or more of RAM and a large fast drive for footage.",
  },
  {
    id: "small-business-server",
    label: "Small-business server",
    summary: "File share, backups and a few light services running around the clock.",
    weights: { cpu: 0.3, gpu: 0, ram: 0.3, storage: 0.4 },
    minRamGb: 32,
    targetRamGb: 64,
    minStorageGb: 2000,
    targetStorageGb: 4000,
    needsGpu: false,
    minGpuPerf: 0,
    minCpuCores: 8,
    driveCount: 2,
    note: "Two drives so a copy of the data exists, plenty of RAM and low-power parts. No graphics card.",
  },
];

export function getProfile(id: UseCase): Profile {
  const p = profiles.find((x) => x.id === id);
  if (!p) throw new Error(`unknown use case ${id}`);
  return p;
}
