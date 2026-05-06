# learn-geometry

Bespoke simulation for CodeSignal math courses — a Desmos-like geometry app
for creating and viewing geometric objects on a coordinate grid.

## Development

```sh
npm install
npm run dev
```

The API server listens on port 3000. In development, Vite serves the React app
and proxies `/api` requests to the server.

## Production Preview

```sh
npm run preview
```

This builds `dist/` and serves the standalone app from Express on port 3000.
