import { catalog } from "./catalog";
import { emptyBuild, explainBuild, planBuild, totalPrice } from "./planner";
import { getProfile, profiles } from "./profiles";
import { checkBuild, hasErrors } from "./rules";
import type { Build, Category, Part, UseCase } from "./types";

type Attrs = Record<string, string>;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const kid of kids) el.append(kid);
  return el;
}

const usd = (n: number): string => `$${n.toLocaleString("en-US")}`;

const LABELS: Record<Category, string> = {
  cpu: "CPU",
  motherboard: "Motherboard",
  ram: "Memory",
  gpu: "Graphics card",
  storage: "Storage",
  psu: "Power supply",
  case: "Case",
  cooler: "CPU cooler",
};

const ROW_ORDER: Category[] = ["cpu", "motherboard", "ram", "gpu", "storage", "psu", "case", "cooler"];

interface State {
  useCase: UseCase;
  budget: number;
  build: Build;
  failure: string | null;
}

function partsOf(b: Build, cat: Category): Part[] {
  if (cat === "storage") return b.storage;
  const p = b[cat];
  return p ? [p] : [];
}

/** Return a copy of the build with one slot replaced (or removed when part is null). */
function withPart(b: Build, cat: Category, slot: number, part: Part | null): Build {
  if (cat === "storage") {
    const storage = [...b.storage];
    if (part && part.category === "storage") storage[slot] = part;
    else storage.splice(slot, 1);
    return { ...b, storage };
  }
  return { ...b, [cat]: part } as Build;
}

export function mount(root: HTMLElement): void {
  const state: State = { useCase: "gaming-1080p", budget: 1200, build: emptyBuild(), failure: null };

  function replan(): void {
    const r = planBuild(state.useCase, state.budget);
    if (r.ok) {
      state.build = r.build;
      state.failure = null;
    } else {
      state.build = emptyBuild();
      state.failure = r.message;
    }
    render();
  }

  function swap(cat: Category, slot: number, id: string): void {
    const part = id === "" ? null : (catalog[cat] as Part[]).find((p) => p.id === id) ?? null;
    state.build = withPart(state.build, cat, slot, part);
    render();
  }

  function pickerFor(cat: Category, slot: number, current: Part | null): HTMLSelectElement {
    const select = h("select", { "aria-label": `Choose ${LABELS[cat].toLowerCase()}` });
    if (cat === "gpu") select.append(h("option", { value: "" }, "None (integrated graphics)"));
    const options = [...(catalog[cat] as Part[])].sort((a, b) => a.price - b.price);
    for (const p of options) {
      const trial = withPart(state.build, cat, slot, p);
      const conflict = hasErrors(checkBuild(trial).filter((i) => i.rule !== "complete"));
      const opt = h("option", { value: p.id }, `${p.name}, $${p.price}${conflict && p.id !== current?.id ? " (conflict)" : ""}`);
      if (p.id === current?.id) opt.selected = true;
      select.append(opt);
    }
    select.addEventListener("change", () => swap(cat, slot, select.value));
    return select;
  }

  function render(): void {
    const profile = getProfile(state.useCase);
    const issues = checkBuild(state.build);
    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");
    const total = totalPrice(state.build);
    const reasons = explainBuild(state.build, state.useCase);

    const pills = h("div", { class: "pills", role: "radiogroup", "aria-label": "Use case" });
    for (const p of profiles) {
      const b = h("button", { type: "button", role: "radio", "aria-checked": String(p.id === state.useCase), class: "pill" }, p.label);
      b.addEventListener("click", () => {
        state.useCase = p.id;
        replan();
      });
      pills.append(b);
    }

    const num = h("input", { type: "number", min: "300", max: "5000", step: "50", value: String(state.budget), "aria-label": "Budget in dollars" });
    const range = h("input", { type: "range", min: "300", max: "5000", step: "50", value: String(state.budget), "aria-label": "Budget slider" });
    const setBudget = (v: string): void => {
      const n = Math.min(5000, Math.max(300, Math.round(Number(v) || 0)));
      state.budget = n;
      replan();
    };
    num.addEventListener("change", () => setBudget(num.value));
    range.addEventListener("change", () => setBudget(range.value));
    range.addEventListener("input", () => {
      num.value = range.value;
    });

    const controls = h(
      "section",
      { class: "glass controls" },
      h("h2", {}, "1. What is the PC for?"),
      pills,
      h("p", { class: "muted" }, profile.summary + " " + profile.note),
      h("h2", {}, "2. Budget"),
      h("div", { class: "budget" }, h("span", {}, "$"), num, range),
    );

    const status = h("div", { class: "status" });
    if (state.failure) {
      status.append(h("p", { class: "badge bad" }, "No build"), h("p", {}, state.failure));
    } else {
      const over = total - state.budget;
      status.append(
        h("p", { class: `badge ${errors.length ? "bad" : warnings.length ? "warn" : "good"}` }, errors.length ? `${errors.length} problem${errors.length > 1 ? "s" : ""}` : warnings.length ? `${warnings.length} warning${warnings.length > 1 ? "s" : ""}` : "All checks pass"),
        h("p", { class: "total" }, `${usd(total)} total`),
        h("p", { class: "muted" }, over > 0 ? `${usd(over)} over budget` : over === 0 ? "Exactly on budget" : `${usd(-over)} under budget`),
      );
    }

    const issueList = h("ul", { class: "issues" });
    for (const i of issues) issueList.append(h("li", { class: i.severity }, h("strong", {}, i.severity === "error" ? "Problem: " : "Warning: "), i.message));
    if (!issues.length && !state.failure) issueList.append(h("li", { class: "good" }, "Every compatibility rule passes for this list."));

    const rows = h("div", { class: "parts" });
    if (!state.failure) {
      for (const cat of ROW_ORDER) {
        const current = partsOf(state.build, cat);
        const slots = cat === "storage" ? Math.max(current.length, 1) : 1;
        for (let slot = 0; slot < slots; slot++) {
          const part = current[slot] ?? null;
          const label = cat === "storage" && slots > 1 ? `${LABELS[cat]} ${slot + 1}` : LABELS[cat];
          rows.append(
            h(
              "div",
              { class: "row" },
              h("div", { class: "cat" }, label),
              h("div", { class: "pick" }, pickerFor(cat, slot, part)),
              h("div", { class: "price" }, part ? `${usd(part.price)}*` : "$0"),
              h("p", { class: "why" }, cat === "storage" && slot > 0 ? "" : (reasons[cat] ?? "")),
            ),
          );
        }
      }
    }

    const copy = h("button", { type: "button", class: "btn" }, "Copy list");
    copy.addEventListener("click", () => {
      const lines = ROW_ORDER.flatMap((c) => partsOf(state.build, c).map((p) => `${LABELS[c]}: ${p.name} (~$${p.price} example)`));
      const text = `${profile.label} build, budget ${usd(state.budget)}\n${lines.join("\n")}\nTotal: ${usd(total)} (example prices, check current)`;
      void navigator.clipboard?.writeText(text).then(
        () => (copy.textContent = "Copied"),
        () => (copy.textContent = "Copy failed"),
      );
    });
    const reset = h("button", { type: "button", class: "btn ghost" }, "Reset to suggested");
    reset.addEventListener("click", replan);

    const result = h(
      "section",
      { class: "glass result" },
      h("div", { class: "result-head" }, h("h2", {}, "3. Your parts list"), h("div", { class: "actions" }, reset, copy)),
      status,
      issueList,
      rows,
      h("p", { class: "muted fine" }, "* Prices are example placeholders, not live prices. Check current prices before you buy. Swap any part above and the rules re-run."),
    );

    root.replaceChildren(
      h(
        "header",
        { class: "top" },
        h("nav", { class: "pill-nav" }, h("span", { class: "brand" }, "Chase Builds"), h("a", { href: "https://github.com/chasebuilds/pc-build-planner" }, "Source")),
        h("h1", {}, "PC Build Planner"),
        h("p", { class: "lede" }, "Pick a use case and a budget. Get a parts list where every part fits together, with the reason for each pick."),
      ),
      h("main", {}, controls, result),
      h("footer", {}, "Runs entirely in your browser. No account, no tracking, no prices fetched."),
    );
  }

  replan();
}
