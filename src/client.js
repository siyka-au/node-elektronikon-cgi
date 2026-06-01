import { formatSelector, normalizeSelector } from "./codec.js";
import { decodePoint, discoverCatalog } from "./catalog.js";
import { UnknownFamilyError, UnknownPointError } from "./errors.js";
import { ElektronikonTransport } from "./protocol.js";

export class ElektronikonClient {
  constructor(options = {}) {
    this.transport = options.transport ?? new ElektronikonTransport(options);
    this.catalogPromise = null;
    this.languagePromise = null;
  }

  async queryRaw(selectors) {
    const results = await this.transport.querySelectors(selectors);
    return {
      host: this.transport.host,
      selectorCount: results.length,
      results: results.map((result) => ({
        selector: normalizeSelector(result).key,
        index: result.index,
        subindex: result.subindex,
        raw: result.raw,
        decoded: result.decoded,
      })),
    };
  }

  async loadLanguage(language = "English") {
    if (this.languagePromise && language === "English") {
      return this.languagePromise;
    }

    const text = await this.transport.fetchText(`/languages/${language}.txt`);
    const entries = new Map();
    for (const line of text.split(/\r?\n/)) {
      const [key, value] = line.split("$$");
      if (key && value) {
        entries.set(key, value);
      }
    }

    if (language === "English") {
      this.languagePromise = Promise.resolve(entries);
    }

    return entries;
  }

  async discover(options = {}) {
    if (!this.catalogPromise) {
      this.catalogPromise = (async () => {
        const languageMap = await this.loadLanguage(options.language ?? "English");
        const catalog = await discoverCatalog(this.transport, languageMap);
        return {
          ...catalog,
          languageMap,
        };
      })();
    }

    return this.catalogPromise;
  }

  async query(options = {}) {
    const selectors = [...(options.selectors ?? [])];
    const pointIds = [...(options.points ?? [])];
    const families = [...(options.families ?? [])];
    const allDiscovered = options.allDiscovered ?? false;

    const needsCatalog = allDiscovered || pointIds.length > 0 || families.length > 0;
    const catalog = needsCatalog ? await this.discover(options) : null;
    const languageMap = catalog?.languageMap ?? await this.loadLanguage(options.language ?? "English");

    const directSelectors = selectors.map(normalizeSelector);
    const selectedPoints = [];

    if (catalog) {
      if (allDiscovered) {
        for (const points of Object.values(catalog.families)) {
          selectedPoints.push(...points);
        }
      }

      for (const family of families) {
        const points = catalog.families[family];
        if (!points) {
          throw new UnknownFamilyError(family);
        }
        selectedPoints.push(...points);
      }

      for (const pointId of pointIds) {
        const point = catalog.pointsById.get(pointId);
        if (!point) {
          throw new UnknownPointError(pointId);
        }
        selectedPoints.push(point);
      }
    }

    const selectedPointMap = new Map();
    for (const point of selectedPoints) {
      selectedPointMap.set(point.id, point);
    }

    const requestSelectorMap = new Map();
    for (const selector of directSelectors) {
      requestSelectorMap.set(selector.key, selector);
    }
    for (const point of selectedPointMap.values()) {
      for (const selector of point.liveSelectors) {
        const normalized = normalizeSelector(selector);
        requestSelectorMap.set(normalized.key, normalized);
      }
    }

    const requestedSelectors = [...requestSelectorMap.values()];
    const rawResults = requestedSelectors.length > 0
      ? await this.transport.querySelectors(requestedSelectors)
      : [];
    const rawMap = new Map(rawResults.map((result) => [result.key, result]));

    return {
      host: this.transport.host,
      selectorCount: requestedSelectors.length,
      directResults: directSelectors.map((selector) => rawMap.get(selector.key)).filter(Boolean).map((result) => ({
        selector: result.key,
        index: result.index,
        subindex: result.subindex,
        raw: result.raw,
        decoded: result.decoded,
      })),
      pointResults: [...selectedPointMap.values()].map((point) => decodePoint(point, new Map(rawResults.map((result) => [result.key, result.raw])), languageMap)),
      catalogSummary: catalog ? catalog.familyCounts : null,
    };
  }

  listPointIds(catalog) {
    return [...catalog.pointsById.keys()].sort();
  }

  selectorForPoint(point) {
    return point.liveSelectors.map((selector) => formatSelector(selector.index, selector.subindex));
  }
}