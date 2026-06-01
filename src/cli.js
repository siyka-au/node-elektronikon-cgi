#!/usr/bin/env node

import { ElektronikonClient } from "./client.js";
import { UsageError } from "./errors.js";

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() ?? "query";
  const options = {
    host: process.env.ELEKTRONIKON_HOST ?? "192.168.100.100",
    selectors: [],
    points: [],
    families: [],
    language: "English",
    allDiscovered: false,
  };

  while (args.length > 0) {
    const current = args.shift();
    switch (current) {
      case "--host":
        options.host = args.shift();
        break;
      case "--selector":
      case "--selectors": {
        const value = args.shift();
        if (!value) {
          throw new UsageError(`${current} requires a comma-separated value`);
        }
        options.selectors.push(...value.split(",").map((item) => item.trim()).filter(Boolean));
        break;
      }
      case "--point":
      case "--points": {
        const value = args.shift();
        if (!value) {
          throw new UsageError(`${current} requires a comma-separated value`);
        }
        options.points.push(...value.split(",").map((item) => item.trim()).filter(Boolean));
        break;
      }
      case "--family":
      case "--families": {
        const value = args.shift();
        if (!value) {
          throw new UsageError(`${current} requires a comma-separated value`);
        }
        options.families.push(...value.split(",").map((item) => item.trim()).filter(Boolean));
        break;
      }
      case "--language":
        options.language = args.shift() ?? options.language;
        break;
      case "--all":
        options.allDiscovered = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new UsageError(`Unknown argument: ${current}`);
    }
  }

  return { command, options };
}

function printHelp() {
  process.stdout.write(
    [
      "Usage:",
      "  node src/cli.js query --selector 300201,300301",
      "  node src/cli.js query --all",
      "  node src/cli.js query --point analogInputs:compressor-outlet --family digitalOutputs",
      "  node src/cli.js discover --language English",
      "",
      "Options:",
      "  --host 192.168.100.100",
      "  --selector 300201,300301",
      "  --point analogInputs:compressor-outlet",
      "  --family analogInputs,digitalOutputs",
      "  --all",
      "  --language English",
    ].join("\n") + "\n",
  );
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const client = new ElektronikonClient({ host: options.host });

  if (command === "query") {
    if (options.selectors.length === 0 && options.points.length === 0 && options.families.length === 0 && !options.allDiscovered) {
      throw new UsageError("query requires --selector, --point, --family, or --all");
    }
    const result = await client.query(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "discover") {
    const catalog = await client.discover(options);
    process.stdout.write(`${JSON.stringify({
      host: options.host,
      language: options.language,
      familyCounts: catalog.familyCounts,
      pointIds: client.listPointIds(catalog),
    }, null, 2)}\n`);
    return;
  }

  throw new UsageError(`Unknown command: ${command}`);
}

main().catch((error) => {
  const payload = typeof error?.toJSON === "function"
    ? error.toJSON()
    : {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
    };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 1;
});