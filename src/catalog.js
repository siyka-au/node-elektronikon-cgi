import {
  decodeRawValue,
  formatSelector,
  readByte,
  readInt16,
  readUInt16,
  readUInt32,
} from "./codec.js";

const ANALOG_INPUT_TYPES = new Map([
  [0, { unit: "bar", normalize: (value) => value / 1000 }],
  [1, { unit: "C", normalize: (value) => value / 10 }],
  [9, { unit: "bar", normalize: (value) => value / 100 }],
  [10, { unit: "%", normalize: (value) => value }],
  [19, { unit: "kW", normalize: (value) => value / 10 }],
]);

const COUNTER_UNITS = new Map([
  [0, { unit: "hours", normalize: (value) => Math.floor(value / 3600) }],
  [1, { unit: "count", normalize: (value) => value }],
  [2, { unit: "1000m3", normalize: (value) => value }],
  [3, { unit: "%", normalize: (value) => value }],
  [4, { unit: "kW", normalize: (value) => value }],
  [6, { unit: "kWh", normalize: (value) => value }],
  [7, { unit: "hh:mm:ss", normalize: (value) => value }],
]);

function selectorMap(results) {
  const map = new Map();
  for (const result of results) {
    map.set(result.key, result.raw);
  }
  return map;
}

function mplLabel(languageMap, mpl) {
  return languageMap.get(`MPL_${mpl}`) ?? null;
}

function machineStateLabel(languageMap, state) {
  return languageMap.get(`MSTATE_${state}`) ?? null;
}

function slugify(label) {
  return String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "point";
}

function assignPointIds(family, points) {
  const counts = new Map();
  return points.map((point) => {
    const base = slugify(point.label ?? `rtd-${point.rtdSi ?? point.subindex ?? point.index}`);
    const seen = (counts.get(base) ?? 0) + 1;
    counts.set(base, seen);
    return {
      ...point,
      id: `${family}:${seen === 1 ? base : `${base}-${seen}`}`,
    };
  });
}

function normalizeAnalogValue(inputType, rawValue) {
  const formatter = ANALOG_INPUT_TYPES.get(inputType);
  if (!formatter) {
    return {
      value: rawValue,
      unit: `type:${inputType}`,
    };
  }
  return {
    value: formatter.normalize(rawValue),
    unit: formatter.unit,
  };
}

function normalizeCounterValue(counterUnit, rawValue) {
  const formatter = COUNTER_UNITS.get(counterUnit);
  if (!formatter) {
    return {
      value: rawValue,
      unit: `unit:${counterUnit}`,
    };
  }
  return {
    value: formatter.normalize(rawValue),
    unit: formatter.unit,
  };
}

function buildFamilySummary(families) {
  return Object.fromEntries(Object.entries(families).map(([family, points]) => [family, points.length]));
}

async function discoverAnalogInputs(transport, languageMap) {
  const selectors = [];
  for (let index = 0x2010; index < 0x2090; index += 1) {
    selectors.push({ index, subindex: 1 }, { index, subindex: 4 }, { index, subindex: 6 });
  }
  const rawMap = selectorMap(await transport.querySelectors(selectors));
  const points = [];
  for (let index = 0x2010; index < 0x2090; index += 1) {
    const raw = rawMap.get(formatSelector(index, 1));
    if (raw && raw !== "X" && readByte(raw, 0) !== 0) {
      const precisionRaw = rawMap.get(formatSelector(index, 4));
      const pressureMeasurementRaw = rawMap.get(formatSelector(index, 6));
      points.push({
        family: "analogInputs",
        index,
        rtdSi: index - 0x2010 + 1,
        mpl: readUInt16(raw, 1),
        label: mplLabel(languageMap, readUInt16(raw, 1)),
        inputType: readByte(raw, 1),
        displayPrecision: precisionRaw && precisionRaw !== "X" ? readByte(precisionRaw, 3) : null,
        pressureMeasurement: pressureMeasurementRaw && pressureMeasurementRaw !== "X" ? readByte(pressureMeasurementRaw, 2) : null,
        liveSelectors: [{ index: 0x3002, subindex: index - 0x2010 + 1 }],
      });
    }
  }
  return assignPointIds("analogInputs", points);
}

async function discoverCalculatedAnalogInputs(transport, languageMap) {
  const selectors = [];
  for (let index = 0x2090; index < 0x20b0; index += 1) {
    selectors.push({ index, subindex: 1 }, { index, subindex: 3 });
  }
  const rawMap = selectorMap(await transport.querySelectors(selectors));
  const points = [];
  for (let index = 0x2090; index < 0x20b0; index += 1) {
    const raw = rawMap.get(formatSelector(index, 1));
    if (raw && raw !== "X" && readByte(raw, 0) !== 0) {
      const precisionRaw = rawMap.get(formatSelector(index, 3));
      points.push({
        family: "calculatedAnalogInputs",
        index,
        rtdSi: index - 0x2090 + 1,
        mpl: readUInt16(raw, 1),
        label: mplLabel(languageMap, readUInt16(raw, 1)),
        inputType: readByte(raw, 1),
        displayPrecision: precisionRaw && precisionRaw !== "X" ? readByte(precisionRaw, 3) : null,
        liveSelectors: [{ index: 0x3004, subindex: index - 0x2090 + 1 }],
      });
    }
  }
  return assignPointIds("calculatedAnalogInputs", points);
}

async function discoverDigitalInputs(transport, languageMap) {
  const selectors = [];
  for (let index = 0x20b0; index < 0x2100; index += 1) {
    selectors.push({ index, subindex: 1 });
  }
  const rawMap = selectorMap(await transport.querySelectors(selectors));
  const points = [];
  for (let index = 0x20b0; index < 0x2100; index += 1) {
    const raw = rawMap.get(formatSelector(index, 1));
    if (raw && raw !== "X" && readByte(raw, 0) !== 0) {
      const mpl = readUInt16(raw, 1);
      points.push({
        family: "digitalInputs",
        index,
        rtdSi: index - 0x20b0 + 1,
        mpl,
        label: mplLabel(languageMap, mpl),
        liveSelectors: [{ index: 0x3003, subindex: index - 0x20b0 + 1 }],
      });
    }
  }
  return assignPointIds("digitalInputs", points);
}

async function discoverDigitalOutputs(transport, languageMap) {
  const selectors = [];
  for (let index = 0x2100; index < 0x2150; index += 1) {
    selectors.push({ index, subindex: 1 });
  }
  const rawMap = selectorMap(await transport.querySelectors(selectors));
  const points = [];
  for (let index = 0x2100; index < 0x2150; index += 1) {
    const raw = rawMap.get(formatSelector(index, 1));
    if (raw && raw !== "X" && readByte(raw, 0) !== 0) {
      const mpl = readUInt16(raw, 1);
      points.push({
        family: "digitalOutputs",
        index,
        rtdSi: index - 0x2100 + 1,
        mpl,
        label: mplLabel(languageMap, mpl),
        liveSelectors: [{ index: 0x3005, subindex: index - 0x2100 + 1 }],
      });
    }
  }
  return assignPointIds("digitalOutputs", points);
}

async function discoverAnalogOutputs(transport, languageMap) {
  const selectors = [];
  for (let index = 0x2150; index < 0x2170; index += 1) {
    selectors.push({ index, subindex: 1 }, { index, subindex: 3 });
  }
  const rawMap = selectorMap(await transport.querySelectors(selectors));
  const points = [];
  for (let index = 0x2150; index < 0x2170; index += 1) {
    const raw = rawMap.get(formatSelector(index, 1));
    if (raw && raw !== "X" && readByte(raw, 0) !== 0) {
      const precisionRaw = rawMap.get(formatSelector(index, 3));
      const mpl = readUInt16(raw, 1);
      points.push({
        family: "analogOutputs",
        index,
        rtdSi: index - 0x2150 + 1,
        mpl,
        label: mplLabel(languageMap, mpl),
        outputType: readByte(raw, 1),
        displayPrecision: precisionRaw && precisionRaw !== "X" ? readByte(precisionRaw, 3) : null,
        liveSelectors: [{ index: 0x3006, subindex: index - 0x2150 + 1 }],
      });
    }
  }
  return assignPointIds("analogOutputs", points);
}

async function discoverCounters(transport, languageMap) {
  const selectors = [];
  for (let subindex = 1; subindex < 256; subindex += 1) {
    selectors.push({ index: 0x2607, subindex });
  }
  const rawMap = selectorMap(await transport.querySelectors(selectors));
  const points = [];
  for (let subindex = 1; subindex < 256; subindex += 1) {
    const raw = rawMap.get(formatSelector(0x2607, subindex));
    if (raw && raw !== "X" && readByte(raw, 0) !== 0) {
      const mpl = readUInt16(raw, 1);
      points.push({
        family: "counters",
        index: 0x2607,
        rtdSi: subindex,
        mpl,
        label: mplLabel(languageMap, mpl),
        counterUnit: readByte(raw, 1),
        liveSelectors: [{ index: 0x3007, subindex }],
      });
    }
  }
  return assignPointIds("counters", points);
}

async function discoverSpecialProtections(transport, languageMap) {
  const selectors = [];
  for (let index = 0x2300; index < 0x247f; index += 1) {
    selectors.push({ index, subindex: 1 });
  }
  const rawMap = selectorMap(await transport.querySelectors(selectors));
  const points = [];
  for (let index = 0x2300; index < 0x247f; index += 1) {
    const raw = rawMap.get(formatSelector(index, 1));
    if (raw && raw !== "X" && readByte(raw, 0) !== 0) {
      const mpl = readUInt16(raw, 1);
      points.push({
        family: "specialProtections",
        index,
        rtdSi: index - 0x2300 + 1,
        mpl,
        label: mplLabel(languageMap, mpl),
        liveSelectors: [{ index: 0x300E, subindex: index - 0x2300 + 1 }],
      });
    }
  }
  return assignPointIds("specialProtections", points);
}

async function discoverSpm(transport, languageMap) {
  const selectors = [];
  for (let index = 0x2560; index < 0x2570; index += 1) {
    selectors.push({ index, subindex: 1 });
  }
  const rawMap = selectorMap(await transport.querySelectors(selectors));
  const points = [];
  for (let index = 0x2560; index < 0x2570; index += 1) {
    const raw = rawMap.get(formatSelector(index, 1));
    if (raw && raw !== "X" && readByte(raw, 0) !== 0) {
      const mpl = readUInt16(raw, 1);
      const rtdSi = 2 * (index - 0x2560) + 1;
      points.push({
        family: "spm",
        index,
        rtdSi,
        mpl,
        label: mplLabel(languageMap, mpl),
        liveSelectors: [
          { index: 0x3015, subindex: rtdSi },
          { index: 0x3015, subindex: rtdSi + 1 },
        ],
      });
    }
  }
  return assignPointIds("spm", points);
}

async function discoverServicePlan(transport) {
  const selectors = [];
  for (let subindex = 1; subindex < 21; subindex += 1) {
    selectors.push({ index: 0x2602, subindex });
  }
  const rawMap = selectorMap(await transport.querySelectors(selectors));
  const points = [];
  for (let subindex = 1; subindex < 21; subindex += 1) {
    const raw = rawMap.get(formatSelector(0x2602, subindex));
    if (raw && raw !== "X" && readUInt32(raw) !== 0) {
      const rtdSi = subindex % 2 === 0 ? 16 + subindex / 2 : 6 + (subindex - 1) / 2;
      const level = Math.ceil(subindex / 2);
      const kind = subindex % 2 === 0 ? "real-time-hours" : "running-hours";
      points.push({
        family: "servicePlan",
        index: 0x2602,
        subindex,
        label: `Service level ${level} ${kind}`,
        staticValue: readUInt32(raw),
        rtdSi,
        level,
        kind,
        liveSelectors: [
          { index: 0x3009, subindex: 1 },
          { index: 0x3009, subindex: rtdSi },
        ],
      });
    }
  }
  return assignPointIds("servicePlan", points);
}

async function discoverMachineState(transport, languageMap) {
  const [meta] = await transport.querySelectors([{ index: 0x2601, subindex: 1 }]);
  let count = 1;
  if (meta.raw !== "X") {
    const regulationType = readByte(meta.raw, 0);
    const machineType = readByte(meta.raw, 1);
    if (regulationType === 79 || regulationType === 84) {
      if (machineType === 39) {
        count = 2;
      } else if (machineType === 40) {
        count = 3;
      }
    }
  }

  return [{
    id: "machineState:current",
    family: "machineState",
    label: "Machine State",
    count,
    liveSelectors: [
      { index: 0x3001, subindex: 8 },
      ...(count > 1 ? [{ index: 0x3001, subindex: 9 }] : []),
    ],
    stateLabels: languageMap,
  }];
}

async function discoverConverters(transport, languageMap) {
  const selectors = [{ index: 0x2601, subindex: 1 }];
  for (let index = 0x2681; index < 0x2689; index += 1) {
    selectors.push({ index, subindex: 1 }, { index, subindex: 7 }, { index, subindex: 8 });
  }
  const rawMap = selectorMap(await transport.querySelectors(selectors));
  const points = [];
  for (let index = 0x2681; index < 0x2689; index += 1) {
    const raw = rawMap.get(formatSelector(index, 1));
    if (raw && raw !== "X" && readByte(raw, 0) !== 0) {
      const mpl = readUInt16(raw, 1);
      const rtdSi = index - 0x2681 + 1;
      points.push({
        family: "converters",
        index,
        rtdSi,
        mpl,
        label: mplLabel(languageMap, mpl),
        liveSelectors: [
          { index: 0x3020 + rtdSi, subindex: 1 },
          { index: 0x3020 + rtdSi, subindex: 5 },
        ],
      });
    }
  }
  return assignPointIds("converters", points);
}

async function discoverInternalData(transport, languageMap) {
  const selectors = [];
  for (let subindex = 1; subindex < 256; subindex += 1) {
    selectors.push({ index: 0x2619, subindex });
  }
  const rawMap = selectorMap(await transport.querySelectors(selectors));
  const points = [];
  for (let subindex = 1; subindex < 256; subindex += 1) {
    const raw = rawMap.get(formatSelector(0x2619, subindex));
    if (raw && raw !== "X" && readByte(raw, 0) !== 0) {
      const mpl = readUInt16(raw, 1);
      points.push({
        family: "internalData",
        index: 0x2619,
        rtdSi: subindex,
        mpl,
        label: mplLabel(languageMap, mpl),
        type: readByte(raw, 1),
        liveSelectors: [{ index: 0x3014, subindex }],
      });
    }
  }
  return assignPointIds("internalData", points);
}

async function discoverDateFormat(transport) {
  return [{
    id: "preferences:date-format",
    family: "preferences",
    label: "Date Format Preference",
    liveSelectors: [{ index: 0x2615, subindex: 1 }],
  }];
}

async function discoverEs(transport) {
  return [{
    id: "es:controller",
    family: "es",
    label: "ES Controller",
    liveSelectors: [
      { index: 0x3113, subindex: 1 },
      { index: 0x3113, subindex: 3 },
      { index: 0x3113, subindex: 4 },
      { index: 0x3113, subindex: 5 },
    ],
  }];
}

export async function discoverCatalog(transport, languageMap) {
  const families = {
    analogInputs: await discoverAnalogInputs(transport, languageMap),
    calculatedAnalogInputs: await discoverCalculatedAnalogInputs(transport, languageMap),
    digitalInputs: await discoverDigitalInputs(transport, languageMap),
    digitalOutputs: await discoverDigitalOutputs(transport, languageMap),
    analogOutputs: await discoverAnalogOutputs(transport, languageMap),
    counters: await discoverCounters(transport, languageMap),
    specialProtections: await discoverSpecialProtections(transport, languageMap),
    spm: await discoverSpm(transport, languageMap),
    servicePlan: await discoverServicePlan(transport, languageMap),
    machineState: await discoverMachineState(transport, languageMap),
    converters: await discoverConverters(transport, languageMap),
    internalData: await discoverInternalData(transport, languageMap),
    preferences: await discoverDateFormat(transport),
    es: await discoverEs(transport),
  };

  const pointsById = new Map();
  for (const points of Object.values(families)) {
    for (const point of points) {
      pointsById.set(point.id, point);
    }
  }

  return {
    discoveredAt: new Date().toISOString(),
    families,
    familyCounts: buildFamilySummary(families),
    pointsById,
  };
}

export function decodePoint(point, rawResponses, languageMap) {
  const primaryRaw = point.liveSelectors.length > 0
    ? rawResponses.get(formatSelector(point.liveSelectors[0].index, point.liveSelectors[0].subindex)) ?? "X"
    : "X";

  switch (point.family) {
    case "analogInputs":
    case "calculatedAnalogInputs": {
      const rawValue = primaryRaw === "X" ? null : readInt16(primaryRaw, 1);
      const normalized = rawValue == null ? null : normalizeAnalogValue(point.inputType, rawValue);
      return {
        ...point,
        raw: primaryRaw,
        status: primaryRaw === "X" ? null : readUInt16(primaryRaw, 0),
        rawValue,
        normalized,
      };
    }
    case "digitalInputs":
    case "digitalOutputs":
      return {
        ...point,
        raw: primaryRaw,
        status: primaryRaw === "X" ? null : readUInt16(primaryRaw, 0),
        value: primaryRaw === "X" ? null : readUInt16(primaryRaw, 1),
      };
    case "analogOutputs":
      return {
        ...point,
        raw: primaryRaw,
        status: primaryRaw === "X" ? null : readUInt16(primaryRaw, 0),
        rawValue: primaryRaw === "X" ? null : readInt16(primaryRaw, 1),
      };
    case "counters": {
      const rawValue = primaryRaw === "X" ? null : readUInt32(primaryRaw);
      return {
        ...point,
        raw: primaryRaw,
        rawValue,
        normalized: rawValue == null ? null : normalizeCounterValue(point.counterUnit, rawValue),
      };
    }
    case "specialProtections":
      return {
        ...point,
        raw: primaryRaw,
        status: primaryRaw === "X" ? null : readUInt16(primaryRaw, 0),
      };
    case "machineState": {
      const secondarySelector = point.liveSelectors[1];
      const secondaryRaw = secondarySelector
        ? rawResponses.get(formatSelector(secondarySelector.index, secondarySelector.subindex)) ?? "X"
        : "X";
      const primaryState = primaryRaw === "X" ? null : readInt16(primaryRaw, 0);
      const secondaryState1 = secondaryRaw === "X" ? null : readUInt16(secondaryRaw, 0);
      const secondaryState2 = secondaryRaw === "X" ? null : readUInt16(secondaryRaw, 1);
      return {
        ...point,
        raw: primaryRaw,
        rawSecondary: secondaryRaw === "X" ? null : secondaryRaw,
        primaryState,
        primaryLabel: primaryState == null ? null : machineStateLabel(languageMap, primaryState),
        secondaryState1,
        secondaryLabel1: secondaryState1 == null ? null : machineStateLabel(languageMap, secondaryState1),
        secondaryState2,
        secondaryLabel2: secondaryState2 == null ? null : machineStateLabel(languageMap, secondaryState2),
      };
    }
    case "converters": {
      const secondarySelector = point.liveSelectors[1];
      const secondaryRaw = secondarySelector
        ? rawResponses.get(formatSelector(secondarySelector.index, secondarySelector.subindex)) ?? "X"
        : "X";
      return {
        ...point,
        raw: primaryRaw,
        rawSecondary: secondaryRaw === "X" ? null : secondaryRaw,
        decoded: decodeRawValue(primaryRaw),
      };
    }
    case "internalData":
      return {
        ...point,
        raw: primaryRaw,
        value: primaryRaw === "X" ? null : readUInt32(primaryRaw),
      };
    case "servicePlan": {
      const nextMaskSelector = point.liveSelectors[0];
      const currentSelector = point.liveSelectors[1];
      const nextMaskRaw = rawResponses.get(formatSelector(nextMaskSelector.index, nextMaskSelector.subindex)) ?? "X";
      const currentRaw = rawResponses.get(formatSelector(currentSelector.index, currentSelector.subindex)) ?? "X";
      const mask = nextMaskRaw === "X" ? null : readUInt32(nextMaskRaw);
      const isNext = mask == null ? null : (((mask >>> (point.level - 1)) & 1) === 1);
      return {
        ...point,
        raw: currentRaw,
        nextMaskRaw,
        currentValue: currentRaw === "X" ? null : readUInt32(currentRaw),
        isNext,
      };
    }
    case "spm": {
      const secondarySelector = point.liveSelectors[1];
      const secondaryRaw = secondarySelector
        ? rawResponses.get(formatSelector(secondarySelector.index, secondarySelector.subindex)) ?? "X"
        : "X";
      return {
        ...point,
        raw: primaryRaw,
        rawSecondary: secondaryRaw === "X" ? null : secondaryRaw,
      };
    }
    case "preferences":
      return {
        ...point,
        raw: primaryRaw,
        type: primaryRaw === "X" ? null : readByte(primaryRaw, 0),
      };
    case "es":
      return {
        ...point,
        raw: primaryRaw,
        active: primaryRaw === "X" ? null : readByte(primaryRaw, 1) === 1,
        nrCompressors: primaryRaw === "X" ? null : readByte(primaryRaw, 0),
        nrDryers: primaryRaw === "X" ? null : readByte(primaryRaw, 2),
        state: (() => {
          const selector = point.liveSelectors[1];
          const raw = selector ? rawResponses.get(formatSelector(selector.index, selector.subindex)) ?? "X" : "X";
          return raw === "X" ? null : readUInt16(raw, 0);
        })(),
        regulationPressureRaw: (() => {
          const selector = point.liveSelectors[2];
          const raw = selector ? rawResponses.get(formatSelector(selector.index, selector.subindex)) ?? "X" : "X";
          return raw === "X" ? null : readUInt32(raw);
        })(),
        controlVsd: (() => {
          const selector = point.liveSelectors[3];
          const raw = selector ? rawResponses.get(formatSelector(selector.index, selector.subindex)) ?? "X" : "X";
          return raw === "X" ? null : readByte(raw, 2);
        })(),
      };
    default:
      return {
        ...point,
        raw: primaryRaw,
        decoded: decodeRawValue(primaryRaw),
      };
  }
}