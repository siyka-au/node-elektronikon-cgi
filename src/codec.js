import { InvalidSelectorError, ResponseAlignmentError } from "./errors.js";

export function hex(value, length) {
  return value.toString(16).padStart(length, "0");
}

export function formatSelector(index, subindex) {
  if (!Number.isInteger(index) || index < 0 || index > 0xffff) {
    throw new InvalidSelectorError({ index, subindex }, "index must be a 16-bit integer");
  }
  if (!Number.isInteger(subindex) || subindex < 0 || subindex > 0xff) {
    throw new InvalidSelectorError({ index, subindex }, "subindex must be an 8-bit integer");
  }
  return `${hex(index, 4)}${hex(subindex, 2)}`;
}

export function normalizeSelector(selector) {
  if (typeof selector === "string") {
    const compact = selector.trim().toLowerCase();
    const rawMatch = compact.match(/^[0-9a-f]{6}$/);
    if (rawMatch) {
      return {
        key: compact,
        index: Number.parseInt(compact.slice(0, 4), 16),
        subindex: Number.parseInt(compact.slice(4, 6), 16),
      };
    }
    const pairMatch = compact.match(/^0x?([0-9a-f]{4})[:/]([0-9a-f]{1,2}|\d{1,3})$/);
    if (pairMatch) {
      const subValue = pairMatch[2].startsWith("0x")
        ? Number.parseInt(pairMatch[2], 16)
        : Number.parseInt(pairMatch[2], 10);
      const index = Number.parseInt(pairMatch[1], 16);
      return {
        key: formatSelector(index, subValue),
        index,
        subindex: subValue,
      };
    }
    throw new InvalidSelectorError(selector, "expected 6 hex digits or 0xIIII:SS format");
  }

  if (selector && typeof selector === "object") {
    const index = selector.index;
    const subindex = selector.subindex;
    return {
      key: formatSelector(index, subindex),
      index,
      subindex,
      meta: selector.meta ?? null,
    };
  }

  throw new InvalidSelectorError(selector, "selector must be a string or { index, subindex }");
}

export function splitAlignedAnswers(selectors, responseText) {
  let offset = 0;
  const answers = selectors.map((selector) => {
    if (offset >= responseText.length) {
      throw new ResponseAlignmentError("Response ended before all selectors were decoded", {
        selector,
        offset,
        responseLength: responseText.length,
      });
    }

    if (responseText[offset] === "X") {
      offset += 1;
      return { ...selector, raw: "X" };
    }

    const raw = responseText.slice(offset, offset + 8);
    if (raw.length !== 8 || !/^[0-9a-fA-F]{8}$/.test(raw)) {
      throw new ResponseAlignmentError("Encountered malformed 8-hex answer while decoding response", {
        selector,
        offset,
        raw,
      });
    }

    offset += 8;
    return { ...selector, raw: raw.toUpperCase() };
  });

  if (offset !== responseText.length) {
    throw new ResponseAlignmentError("Response contained trailing undecoded data", {
      consumed: offset,
      responseLength: responseText.length,
      trailing: responseText.slice(offset, Math.min(responseText.length, offset + 32)),
    });
  }

  return answers;
}

export function readUInt32(raw) {
  return Number.parseInt(raw, 16);
}

export function readInt32(raw) {
  let value = Number.parseInt(raw, 16);
  if (value >>> 31) {
    value = -2147483648 + (value & 0x7fffffff);
  }
  return value;
}

export function readUInt16(raw, word) {
  return Number.parseInt(raw.substring((1 - word) * 4, (2 - word) * 4), 16);
}

export function readInt16(raw, word) {
  let value = readUInt16(raw, word);
  if (value >>> 15) {
    value = -32768 + (value & 0x7fff);
  }
  return value;
}

export function readByte(raw, byteIndex) {
  return Number.parseInt(raw.substring((3 - byteIndex) * 2, (4 - byteIndex) * 2), 16);
}

export function decodeRawValue(raw) {
  if (raw === "X") {
    return {
      raw,
      missing: true,
    };
  }

  return {
    raw,
    missing: false,
    uint32: readUInt32(raw),
    int32: readInt32(raw),
    uint16Word1: readUInt16(raw, 1),
    uint16Word0: readUInt16(raw, 0),
    int16Word1: readInt16(raw, 1),
    int16Word0: readInt16(raw, 0),
    bytes: [readByte(raw, 0), readByte(raw, 1), readByte(raw, 2), readByte(raw, 3)],
  };
}