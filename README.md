# Trade Dashboard

React + TypeScript + Vite trading dashboard that connects to a local market-data WebSocket backend.

## Prerequisites

- Node.js 18 or newer
- npm
- Git with submodule support

The socket backend is included as a Git submodule from [socket-custom-load](https://github.com/saxenanickk/socket-custom-load). The upstream backend README mentions Bun, but this project runs the backend with Node/npm through the scripts below.

## Quick Start

Clone the repo with its backend submodule:

```bash
git clone --recurse-submodules <repo-url>
cd Trade-Dashboard
```

Install frontend dependencies:

```bash
npm install
```

Initialize the backend submodule and install backend dependencies:

```bash
npm run setup:backend
```

Start the frontend and backend together:

```bash
npm run dev
```

Open the app at [http://localhost:5173](http://localhost:5173).

## If You Already Cloned Without Submodules

If `socket-backend` is missing or empty, initialize it first:

```bash
git submodule update --init --recursive
npm run setup:backend
npm run dev
```

## Local Services

When `npm run dev` is running, the project uses these local URLs:

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend WebSocket: `ws://localhost:8080`
- Backend HTTP API: `http://localhost:3000/intervals`
- Frontend proxy endpoint: `http://localhost:5173/api/intervals`

The frontend defaults to the local backend URLs, so no `.env` file is required for normal local development.

## Optional Environment Variables

Create `.env.local` only if you need to point the frontend at a different backend:

```bash
VITE_MARKET_WS_URL=ws://localhost:8080
VITE_MARKET_HTTP_URL=http://localhost:3000
```

`VITE_MARKET_WS_URL` controls the WebSocket connection. `VITE_MARKET_HTTP_URL` controls the HTTP interval endpoint used by the runtime load controls; `/intervals` is appended automatically when needed. If `VITE_MARKET_HTTP_URL` is omitted, runtime load controls call `/api/intervals`, which is proxied by Vite locally and by the Vercel function in `api/intervals.js` in production.

## Production Deployment

The Vite frontend can be deployed to Vercel, but `socket-backend` must run as a separate long-lived Node process on a host that supports WebSockets.

After deploying the backend, set these frontend environment variables in Vercel:

```bash
VITE_MARKET_WS_URL=wss://<backend-host>
MARKET_HTTP_URL=https://<backend-http-host>
```

`MARKET_HTTP_URL` is server-only and is used by the Vercel `/api/intervals` proxy. Set `VITE_MARKET_HTTP_URL` only if the backend HTTP API supports browser CORS and you want the browser to call it directly.

## Available Scripts

```bash
npm run dev            # Start the Vite frontend and socket backend together
npm run dev:frontend   # Start only the Vite frontend
npm run setup:backend  # Initialize the socket backend submodule and install backend deps
npm run dev:backend    # Start only the socket backend
npm run build          # Type-check and build the frontend
npm run lint           # Run ESLint
npm run preview        # Preview the production build locally
```

## Running Frontend and Backend Separately

Use separate terminals if you want to run each service manually:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

## Troubleshooting

If the dashboard stays disconnected, make sure the backend is running and listening on `ws://localhost:8080`.

If changing runtime load fails, make sure the backend HTTP server is available at `http://localhost:3000/intervals`. During frontend development, Vite proxies `/api/intervals` to that backend endpoint.

If backend startup fails because files are missing, run:

```bash
git submodule update --init --recursive
npm run setup:backend
```
