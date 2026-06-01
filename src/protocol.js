import { decodeRawValue, normalizeSelector, splitAlignedAnswers } from "./codec.js";
import { ElektronikonHttpError } from "./errors.js";

export class ElektronikonTransport {
  constructor(options = {}) {
    const rawHost = options.host ?? process.env.ELEKTRONIKON_HOST ?? "192.168.100.100";
    this.host = `http://${rawHost.replace(/\/+$/, "")}`;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.batchSize = options.batchSize ?? 1000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;

    if (typeof this.fetchImpl !== "function") {
      throw new ElektronikonHttpError("A fetch implementation is required", {
        host: this.host,
      });
    }
  }

  async fetchText(pathname) {
    const url = `${this.host}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
    const signal = AbortSignal.timeout(this.timeoutMs);
    let response;
    try {
      response = await this.fetchImpl(url, { signal });
    } catch (error) {
      throw new ElektronikonHttpError(`Request failed for ${url}`, { url }, error);
    }

    if (!response.ok) {
      throw new ElektronikonHttpError(`Unexpected HTTP status ${response.status} for ${url}`, {
        url,
        status: response.status,
        statusText: response.statusText,
      });
    }

    return response.text();
  }

  async querySelectors(selectors) {
    const normalized = selectors.map(normalizeSelector);
    const results = [];
    for (let offset = 0; offset < normalized.length; offset += this.batchSize) {
      const batch = normalized.slice(offset, offset + this.batchSize);
      results.push(...await this.queryBatch(batch));
    }
    return results;
  }

  async queryBatch(selectors) {
    const body = new URLSearchParams({
      QUESTION: selectors.map((selector) => selector.key).join(""),
    }).toString();
    const url = `${this.host}/cgi-bin/mkv.cgi`;
    const signal = AbortSignal.timeout(this.timeoutMs);
    let response;

    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body,
        signal,
      });
    } catch (error) {
      throw new ElektronikonHttpError("Unable to complete mkv.cgi request", {
        url,
        selectorCount: selectors.length,
      }, error);
    }

    if (!response.ok) {
      throw new ElektronikonHttpError(`Unexpected HTTP status ${response.status} for mkv.cgi`, {
        url,
        status: response.status,
        statusText: response.statusText,
        selectorCount: selectors.length,
      });
    }

    const responseText = await response.text();
    return splitAlignedAnswers(selectors, responseText).map((answer) => ({
      ...answer,
      decoded: decodeRawValue(answer.raw),
    }));
  }
}