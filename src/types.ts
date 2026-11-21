export type Socket = "AM4" | "AM5" | "LGA1700";
export type FormFactor = "ATX" | "mATX" | "ITX";
export type RamType = "DDR4" | "DDR5";
export type StorageInterface = "NVMe" | "SATA";

interface Base {
  id: string;
  name: string;
  /** Example placeholder price in USD. Not a live price. */
  price: number;
}

export interface Cpu extends Base {
  category: "cpu";
  socket: Socket;
  cores: number;
  tdp: number;
  /** Rough relative performance, 0 to 100, used only for ranking. */
  perf: number;
  hasIgpu: boolean;
}

export interface Motherboard extends Base {
  category: "motherboard";
  socket: Socket;
  formFactor: FormFactor;
  ramType: RamType;
  maxRamSpeed: number;
  ramSlots: number;
  maxRamGb: number;
  m2Slots: number;
  sataPorts: number;
}

export interface Ram extends Base {
  category: "ram";
  type: RamType;
  speed: number;
  /** Total capacity of the kit. */
  capacityGb: number;
  sticks: number;
}

export interface Gpu extends Base {
  category: "gpu";
  tdp: number;
  lengthMm: number;
  vramGb: number;
  perf: number;
}

export interface Storage extends Base {
  category: "storage";
  interface: StorageInterface;
  capacityGb: number;
}

export interface Psu extends Base {
  category: "psu";
  watts: number;
}

export interface Case extends Base {
  category: "case";
  formFactors: FormFactor[];
  maxGpuMm: number;
  maxCoolerMm: number;
}

export interface Cooler extends Base {
  category: "cooler";
  heightMm: number;
  sockets: Socket[];
  /** Heat the cooler is rated to remove, in watts. */
  tdpRating: number;
}

export type Part = Cpu | Motherboard | Ram | Gpu | Storage | Psu | Case | Cooler;
export type Category = Part["category"];

export interface Catalog {
  cpu: Cpu[];
  motherboard: Motherboard[];
  ram: Ram[];
  gpu: Gpu[];
  storage: Storage[];
  psu: Psu[];
  case: Case[];
  cooler: Cooler[];
}

export interface Build {
  cpu: Cpu | null;
  motherboard: Motherboard | null;
  ram: Ram | null;
  gpu: Gpu | null;
  storage: Storage[];
  psu: Psu | null;
  case: Case | null;
  cooler: Cooler | null;
}

export type Severity = "error" | "warning";

export interface Issue {
  rule: string;
  severity: Severity;
  message: string;
}

export type UseCase =
  | "office"
  | "home-office"
  | "gaming-1080p"
  | "gaming-1440p"
  | "video-editing"
  | "small-business-server";
