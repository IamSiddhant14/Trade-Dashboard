# Trade Dashboard

React + TypeScript + Vite frontend for a trading dashboard.

## Clone

This project uses the socket stress-test backend as a Git submodule:

```bash
git clone --recurse-submodules <your-repo-url>
cd Trade-Dashboard
npm install
npm run setup:backend
npm run dev
```

If the repo was cloned without `--recurse-submodules`, run:

```bash
git submodule update --init --recursive
npm run setup:backend
npm run dev
```

`npm run dev` starts both the frontend and backend together:

- Frontend: http://localhost:5173
- Backend WebSocket: ws://localhost:8080
- Backend HTTP API: http://localhost:3000/intervals

## Development

Start the frontend and socket backend together:

```bash
npm run dev
```

Install backend dependencies before the first run:

```bash
npm run setup:backend
```

The backend comes from https://github.com/saxenanickk/socket-custom-load. The upstream README uses Bun, but these project scripts run it with Node/npm, so Bun is not required.

## Scripts

```bash
npm run dev            # Start the Vite frontend and socket backend
npm run dev:frontend   # Start only the Vite frontend
npm run setup:backend  # Initialize the socket backend submodule and install backend deps
npm run dev:backend    # Start only the socket backend
npm run build          # Build the frontend
npm run lint           # Run ESLint
```
