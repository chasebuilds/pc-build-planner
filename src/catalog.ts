import raw from "./data/catalog.json";
import type { Catalog } from "./types";

export const catalog = raw as unknown as Catalog;
