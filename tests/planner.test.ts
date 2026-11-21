import { describe, expect, it } from "vitest";
import { catalog } from "../src/catalog";
import { explainBuild, planBuild, totalPrice } from "../src/planner";
import { profiles } from "../src/profiles";
import { checkBuild } from "../src/rules";

describe("planBuild", () => {
  for (const p of profiles) {
    it(`${p.id}: plans a clean build across budgets`, () => {
      let found = 0;
      for (const budget of [500, 700, 900, 1200, 1600, 2200, 3500]) {
        const r = planBuild(p.id, budget);
        if (!r.ok) continue;
        found++;
        expect(r.total).toBeLessThanOrEqual(budget);
        expect(r.total).toBe(totalPrice(r.build));
        expect(checkBuild(r.build)).toEqual([]);
        expect(r.build.cpu?.cores ?? 0).toBeGreaterThanOrEqual(p.minCpuCores);
        expect(r.build.ram?.capacityGb ?? 0).toBeGreaterThanOrEqual(p.minRamGb);
        expect(r.build.storage).toHaveLength(p.driveCount);
        if (p.needsGpu) expect(r.build.gpu).not.toBeNull();
        else expect(r.build.gpu === null || r.build.cpu?.hasIgpu === false).toBe(true);
      }
      expect(found).toBeGreaterThan(2);
    });
  }

  it("a bigger budget never lowers the score", () => {
    let last = -1;
    for (const budget of [900, 1200, 1600, 2200, 3500]) {
      const r = planBuild("gaming-1440p", budget);
      if (!r.ok) continue;
      expect(r.score).toBeGreaterThanOrEqual(last);
      last = r.score;
    }
  });

  it("reports the cheapest working total when the budget is too low", () => {
    const r = planBuild("video-editing", 200);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.minBudget).toBeGreaterThan(200);
      expect(r.message).toContain("example prices");
    }
  });

  it("returns a failure when no part can meet the use case", () => {
    const empty = { ...catalog, cpu: [] };
    const r = planBuild("office", 5000, empty);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.minBudget).toBeNull();
  });

  it("server build uses two drives and no graphics card", () => {
    const r = planBuild("small-business-server", 1500);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.build.storage).toHaveLength(2);
      expect(r.build.gpu).toBeNull();
    }
  });
});

describe("explainBuild", () => {
  it("gives a reason for every part", () => {
    const r = planBuild("gaming-1080p", 1200);
    if (!r.ok) throw new Error("expected a build");
    const reasons = explainBuild(r.build, "gaming-1080p");
    for (const k of ["cpu", "motherboard", "ram", "gpu", "storage", "psu", "case", "cooler"] as const) {
      expect(reasons[k]).toBeTruthy();
    }
  });
});

describe("catalog data", () => {
  it("has unique ids and positive example prices", () => {
    const ids = Object.values(catalog).flat().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of Object.values(catalog).flat()) expect(p.price).toBeGreaterThan(0);
  });
});
