#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://datos.madrid.es/dataset/200075-0-callejero/resource/200075-1-callejero-csv/download/200075-1-callejero-csv.csv';
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'js', 'madrid-postal-centroids.js');

function argument(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : '';
}

function dmsToDecimal(value) {
  const match = String(value || '').trim().match(/(\d+)[^\d]+(\d+)[^\d]+([\d.]+)[^NSEW]*([NSEW])/i);
  if (!match) return null;
  const decimal = Number(match[1]) + Number(match[2]) / 60 + Number(match[3]) / 3600;
  if (!Number.isFinite(decimal)) return null;
  return ['S', 'W'].includes(match[4].toUpperCase()) ? -decimal : decimal;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function parseLine(line) {
  const normalized = line.startsWith('"') ? line.slice(1, line.endsWith('"') ? -1 : undefined) : line;
  const fields = normalized.split('";"');
  if (fields.length < 20) return null;
  const postalCode = String(fields[11] || '').trim();
  if (!/^280\d{2}$/.test(postalCode)) return null;
  const lng = dmsToDecimal(fields[18]);
  const lat = dmsToDecimal(fields[19]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { postalCode, lat, lng };
}

async function readSource() {
  const input = argument('input');
  if (input) return fs.readFile(path.resolve(input), 'latin1');
  const response = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'ClasesDe10-PostalCentroids/1.0' } });
  if (!response.ok) throw new Error(`Madrid open-data download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer()).toString('latin1');
}

const source = await readSource();
const buckets = new Map();
String(source).split(/\r?\n/).slice(1).forEach((line) => {
  const parsed = parseLine(line);
  if (!parsed) return;
  if (!buckets.has(parsed.postalCode)) buckets.set(parsed.postalCode, { latitudes: [], longitudes: [] });
  buckets.get(parsed.postalCode).latitudes.push(parsed.lat);
  buckets.get(parsed.postalCode).longitudes.push(parsed.lng);
});

const centroids = Object.fromEntries([...buckets.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([postalCode, values]) => [postalCode, {
    lat: Number(median(values.latitudes).toFixed(6)),
    lng: Number(median(values.longitudes).toFixed(6)),
    samples: values.latitudes.length,
  }]));

if (Object.keys(centroids).length < 50) {
  throw new Error(`Expected at least 50 Madrid postal codes, found ${Object.keys(centroids).length}.`);
}

const generatedAt = new Date().toISOString().slice(0, 10);
const rows = Object.entries(centroids)
  .map(([postalCode, value]) => `  '${postalCode}': Object.freeze({ lat: ${value.lat}, lng: ${value.lng}, samples: ${value.samples} }),`)
  .join('\n');
const output = `/**\n * Generated from the Madrid City Council official street directory.\n * Regenerate with: npm run geo:generate-postal-centroids\n */\n\nexport const MADRID_POSTAL_CENTROIDS_SOURCE = Object.freeze({\n  authority: 'Ayuntamiento de Madrid - Portal de Datos Abiertos',\n  dataset: 'Direcciones postales vigentes con coordenadas geograficas',\n  url: '${SOURCE_URL}',\n  license: 'CC BY 4.0',\n  generatedAt: '${generatedAt}',\n  method: 'median_of_official_address_coordinates',\n});\n\nexport const MADRID_POSTAL_CENTROIDS = Object.freeze({\n${rows}\n});\n\nexport function madridPostalCentroid(postalCode) {\n  const normalized = String(postalCode ?? '').trim();\n  return MADRID_POSTAL_CENTROIDS[normalized] || null;\n}\n`;

await fs.writeFile(OUTPUT_FILE, output, 'utf8');
console.log(JSON.stringify({
  ok: true,
  output: path.relative(PROJECT_ROOT, OUTPUT_FILE).replaceAll('\\', '/'),
  postalCodes: Object.keys(centroids).length,
  samples: Object.values(centroids).reduce((sum, item) => sum + item.samples, 0),
  source: argument('input') || SOURCE_URL,
}, null, 2));
