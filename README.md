# node-elektronikon-cgi

Node client and CLI for Atlas Copco Elektronikon MkV controllers that expose `mkv.cgi`.

## Requirements

- Node 20+
- Network access to the controller, default host `192.168.100.100`

No external dependencies are required.

## CLI

Query a few raw selectors:

```bash
npm run query -- --selector 300201,300301,300701
```

Discover the current live catalog and point ids:

```bash
npm run discover
```

Query all discovered points:

```bash
npm run query -- --all
```

Mix direct selectors, named points, and whole families in one request:

```bash
npm run query -- --selector 300201 --point analogInputs:compressor-outlet --family digitalOutputs
```

Override the target host when needed:

```bash
npm run query -- --host 192.168.100.100 --selector 300201
```

Invalid input is reported as structured JSON:

```bash
node ./src/cli.js query --selector bad
```

## Library

```js
import { ElektronikonClient } from "./src/index.js";

const client = new ElektronikonClient({ host: "192.168.100.100" });

const direct = await client.query({ selectors: ["300201", "300301"] });
const catalog = await client.discover();
const allPoints = await client.query({ allDiscovered: true });
const mixed = await client.query({
  selectors: ["300201"],
  points: ["analogInputs:compressor-outlet"],
  families: ["digitalOutputs"],
});

console.log(catalog.familyCounts);
console.log(allPoints.pointResults.length);
console.log(mixed.pointResults.map((point) => point.id));
```

## Tests

Run unit tests:

```bash
npm test
```

Run live integration tests against the controller:

```bash
npm run test:integration
```

Override the target host with `ELEKTRONIKON_HOST` — a bare IP, hostname, or full URL are all accepted:

```bash
ELEKTRONIKON_HOST=192.168.100.100 npm run test:integration
```

Run both:

```bash
ELEKTRONIKON_HOST=192.168.100.100 npm run test:all
```

## Project Notes

- Transport and wire format notes are in `notes/elektronikon-mkv-protocol.md`.
