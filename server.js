const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const configPath = path.join(__dirname, 'config.json');
const distPath = path.join(__dirname, 'dist');

let state = readConfig();

app.use(express.json({ limit: '1mb' }));

app.get('/api/config', (_request, response) => {
  response.json(readConfig());
});

app.get('/api/state', (request, response) => {
  const format = request.query.format === 'text' ? 'text' : 'json';

  if (format === 'text') {
    response.type('text/plain').send(state.objects.map(summarizeObject).join('\n'));
    return;
  }

  response.json(state.objects);
});

app.post('/api/state', (request, response) => {
  const objects = request.body?.objects;

  if (!Array.isArray(objects)) {
    response.status(400).json({ error: 'Expected body shape: { objects: GeomObject[] }' });
    return;
  }

  state = { objects };
  response.json({ ok: true, objects: state.objects });
});

if (process.env.IS_PRODUCTION === 'true') {
  app.use(express.static(distPath));
  app.get('*', (_request, response) => {
    response.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`learn-geometry server listening on port ${port}`);
});

function readConfig() {
  try {
    if (!fs.existsSync(configPath)) {
      return { objects: [] };
    }

    const contents = fs.readFileSync(configPath, 'utf8').trim();
    if (!contents) {
      return { objects: [] };
    }

    const parsed = JSON.parse(contents);
    return normalizeState(parsed);
  } catch (error) {
    console.warn(`Unable to read config.json: ${error.message}`);
    return { objects: [] };
  }
}

function normalizeState(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.objects)) {
    return { objects: [] };
  }

  return { objects: value.objects };
}

function summarizeObject(object) {
  if (!object || typeof object !== 'object') {
    return 'Unknown object';
  }

  const label = object.label ? ` (${object.label})` : '';

  switch (object.type) {
    case 'point':
      return `Point${label} at (${formatNumber(object.x)}, ${formatNumber(object.y)})`;
    case 'circle':
      return `Circle${label} at (${formatNumber(object.cx)}, ${formatNumber(object.cy)}) with radius ${formatNumber(object.r)}`;
    case 'line':
      return `Line${label} from (${formatNumber(object.x1)}, ${formatNumber(object.y1)}) to (${formatNumber(object.x2)}, ${formatNumber(object.y2)})`;
    case 'rectangle':
      return `Rectangle${label} at (${formatNumber(object.x)}, ${formatNumber(object.y)}) with width ${formatNumber(object.w)} and height ${formatNumber(object.h)}`;
    case 'polygon':
      return `Polygon${label} with points ${formatPoints(object.points)}`;
    case 'function':
      return `Function${label}: y = ${object.expression}`;
    default:
      return `Unknown object${label}`;
  }
}

function formatPoints(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return 'none';
  }

  return points.map((point) => `(${formatNumber(point?.[0])}, ${formatNumber(point?.[1])})`).join(', ');
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return String(value);
  }

  return Number.isInteger(number) ? String(number) : number.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
