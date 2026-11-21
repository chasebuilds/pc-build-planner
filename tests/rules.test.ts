import { describe, expect, it } from "vitest";
import { checkBuild, estimatedLoadW, hasErrors, OTHER_LOAD_W } from "../src/rules";
import type { Build, Issue } from "../src/types";
import { cooler, cpu, goodBuild, gpu, mb, pcCase, psu, ram, storage } from "./helpers";

const only = (b: Build, rule: string): Issue[] => checkBuild(b).filter((i) => i.rule === rule);

describe("baseline", () => {
  it("known-good build has no issues", () => {
    expect(checkBuild(goodBuild())).toEqual([]);
  });
});

describe("complete", () => {
  it("flags every missing required part", () => {
    const empty: Build = { cpu: null, motherboard: null, ram: null, gpu: null, storage: [], psu: null, case: null, cooler: null };
    const [issue] = only(empty, "complete");
    expect(issue?.severity).toBe("error");
    for (const word of ["CPU", "motherboard", "RAM", "storage", "power supply", "case", "cooler"]) {
      expect(issue?.message).toContain(word);
    }
  });
  it("does not require a graphics card", () => {
    expect(only({ ...goodBuild(), gpu: null }, "complete")).toEqual([]);
  });
});

describe("socket", () => {
  it("errors on mismatch", () => {
    expect(only({ ...goodBuild(), cpu: cpu("cpu-lga-6c") }, "socket")[0]?.severity).toBe("error");
  });
  it("passes on match", () => {
    expect(only(goodBuild(), "socket")).toEqual([]);
  });
});

describe("ram-type", () => {
  it("errors on DDR4 in a DDR5 board", () => {
    expect(only({ ...goodBuild(), ram: ram("ram-d4-32") }, "ram-type")[0]?.severity).toBe("error");
  });
  it("passes on match", () => {
    expect(only(goodBuild(), "ram-type")).toEqual([]);
  });
});

describe("ram-speed", () => {
  it("warns when the kit is faster than the board supports", () => {
    expect(only({ ...goodBuild(), ram: ram("ram-d5-32x") }, "ram-speed")[0]?.severity).toBe("warning");
  });
  it("is quiet at exactly the limit", () => {
    expect(only({ ...goodBuild(), ram: ram("ram-d5-32f") }, "ram-speed")).toEqual([]);
  });
  it("is quiet on a type mismatch (ram-type reports that)", () => {
    expect(only({ ...goodBuild(), ram: ram("ram-d4-32f") }, "ram-speed")).toEqual([]);
  });
});

describe("ram-slots", () => {
  it("errors when there are more sticks than slots", () => {
    const b = { ...goodBuild(), motherboard: mb("mb-am5-itx"), ram: { ...ram("ram-d5-32f"), sticks: 4 } };
    expect(only(b, "ram-slots").some((i) => i.message.includes("slots"))).toBe(true);
  });
  it("errors when capacity exceeds the board maximum", () => {
    const b = { ...goodBuild(), motherboard: mb("mb-am5-itx"), ram: { ...ram("ram-d5-64"), capacityGb: 128 } };
    expect(only(b, "ram-slots").some((i) => i.message.includes("GB"))).toBe(true);
  });
  it("passes for a normal kit", () => {
    expect(only(goodBuild(), "ram-slots")).toEqual([]);
  });
});

describe("case-form", () => {
  it("errors when an ATX board goes in a micro-ATX case", () => {
    const b = { ...goodBuild(), motherboard: mb("mb-am5-atx"), case: pcCase("case-matx") };
    expect(only(b, "case-form")[0]?.severity).toBe("error");
  });
  it("passes when a smaller board goes in a bigger case", () => {
    expect(only({ ...goodBuild(), case: pcCase("case-atx-full") }, "case-form")).toEqual([]);
  });
});

describe("gpu-length", () => {
  it("errors when the card is too long", () => {
    const b = { ...goodBuild(), gpu: gpu("gpu-u16"), case: pcCase("case-matx-budget") };
    expect(only(b, "gpu-length")[0]?.severity).toBe("error");
  });
  it("warns when under 10 mm to spare", () => {
    const b = { ...goodBuild(), gpu: gpu("gpu-m8"), case: { ...pcCase("case-matx-budget"), maxGpuMm: 249 } };
    expect(only(b, "gpu-length")[0]?.severity).toBe("warning");
  });
  it("is quiet at exactly 10 mm to spare", () => {
    const b = { ...goodBuild(), gpu: gpu("gpu-m8"), case: pcCase("case-matx-budget") };
    expect(only(b, "gpu-length")).toEqual([]);
  });
  it("is skipped without a card", () => {
    expect(only({ ...goodBuild(), gpu: null }, "gpu-length")).toEqual([]);
  });
});

describe("gpu-present", () => {
  it("errors for a CPU with no integrated graphics and no card", () => {
    const b = { ...goodBuild(), cpu: cpu("cpu-am4-6c"), motherboard: mb("mb-am4-matx"), ram: ram("ram-d4-32"), gpu: null };
    expect(only(b, "gpu-present")[0]?.severity).toBe("error");
  });
  it("passes when the CPU has integrated graphics", () => {
    expect(only({ ...goodBuild(), gpu: null }, "gpu-present")).toEqual([]);
  });
  it("passes when a card is present", () => {
    expect(only({ ...goodBuild(), cpu: cpu("cpu-am4-6c") }, "gpu-present")).toEqual([]);
  });
});

describe("psu-wattage", () => {
  it("computes load from CPU, GPU and a fixed allowance", () => {
    expect(estimatedLoadW(goodBuild())).toBe(65 + 190 + OTHER_LOAD_W);
  });
  it("counts no GPU load when there is no card", () => {
    expect(estimatedLoadW({ ...goodBuild(), gpu: null })).toBe(65 + OTHER_LOAD_W);
  });
  it("errors when the PSU is below the load", () => {
    const b = { ...goodBuild(), gpu: gpu("gpu-u24"), psu: psu("psu-450") };
    expect(only(b, "psu-wattage")[0]?.severity).toBe("error");
  });
  it("warns when under 25 percent headroom", () => {
    // 105 + 285 + 75 = 465 W load, needs 582 W; 550 W warns
    const b = { ...goodBuild(), cpu: cpu("cpu-am5-8c"), gpu: gpu("gpu-q16"), psu: psu("psu-550") };
    expect(only(b, "psu-wattage")[0]?.severity).toBe("warning");
  });
  it("passes with enough headroom", () => {
    expect(only(goodBuild(), "psu-wattage")).toEqual([]);
  });
});

describe("cooler-height", () => {
  it("errors when the cooler is taller than the case allows", () => {
    const b = { ...goodBuild(), cooler: cooler("cool-dual"), case: pcCase("case-matx-budget") };
    expect(only(b, "cooler-height")[0]?.severity).toBe("error");
  });
  it("warns within 5 mm", () => {
    const b = { ...goodBuild(), cooler: cooler("cool-dual"), case: pcCase("case-atx") }; // 165 in 165
    expect(only(b, "cooler-height")[0]?.severity).toBe("warning");
  });
  it("passes with clearance", () => {
    expect(only(goodBuild(), "cooler-height")).toEqual([]);
  });
});

describe("cooler-socket", () => {
  it("errors when the cooler lacks the CPU socket mount", () => {
    const b = {
      ...goodBuild(),
      cpu: cpu("cpu-lga-6c"),
      motherboard: mb("mb-lga-matx-d5"),
      ram: ram("ram-d5-32"),
      cooler: cooler("cool-am-budget"),
    };
    expect(only(b, "cooler-socket")[0]?.severity).toBe("error");
  });
  it("passes when listed", () => {
    expect(only(goodBuild(), "cooler-socket")).toEqual([]);
  });
});

describe("cooler-capacity", () => {
  it("warns when the CPU out-heats the cooler", () => {
    const b = { ...goodBuild(), cpu: cpu("cpu-am5-16c"), cooler: cooler("cool-92") };
    expect(only(b, "cooler-capacity")[0]?.severity).toBe("warning");
  });
  it("passes when rated above CPU TDP", () => {
    expect(only(goodBuild(), "cooler-capacity")).toEqual([]);
  });
});

describe("storage-interface", () => {
  it("errors when NVMe drives exceed M.2 slots", () => {
    const b = {
      ...goodBuild(),
      cpu: cpu("cpu-am4-6c"),
      motherboard: mb("mb-am4-matx"),
      ram: ram("ram-d4-32"),
      storage: [storage("sto-n1"), storage("sto-n2")],
    };
    expect(only(b, "storage-interface")[0]?.message).toContain("M.2");
  });
  it("errors when SATA drives exceed SATA ports", () => {
    const sata = storage("sto-s1");
    const b = { ...goodBuild(), storage: [sata, sata, sata, sata, sata] };
    expect(only(b, "storage-interface")[0]?.message).toContain("SATA");
  });
  it("passes with a mix within limits", () => {
    const b = { ...goodBuild(), storage: [storage("sto-n1"), storage("sto-h4")] };
    expect(only(b, "storage-interface")).toEqual([]);
  });
});

describe("hasErrors", () => {
  it("separates errors from warnings", () => {
    expect(hasErrors([{ rule: "x", severity: "warning", message: "" }])).toBe(false);
    expect(hasErrors([{ rule: "x", severity: "error", message: "" }])).toBe(true);
  });
});
