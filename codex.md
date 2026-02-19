# Mini Factory Twin - Codex Notes

## Current Direction
- Keep RL training in Python.
- Move the simulation core to Rust for performance and deterministic event-loop behavior.
- Keep the frontend in TypeScript (React + Three.js).

## Why This Split
- Python remains the best orchestration layer for RL tooling and experimentation speed.
- Rust is a strong fit for the DES kernel hot path.
- A Rust-first RL stack is possible, but it will slow iteration and reduce access to mature RL libraries.

## Recommended Runtime Architecture
1. Rust crate implements `reset`, `step`, `run_to_finish`, and `snapshot` APIs.
2. Python bindings expose the Rust engine to Gymnasium-compatible wrappers.
3. FastAPI serves simulation state and experiment CRUD.
4. TypeScript frontend consumes typed API models.

## Frontend TypeScript Migration (Completed)
- Converted frontend source from JS/JSX to TS/TSX.
- Added shared domain types in `frontend/src/types.ts`.
- Typed API layer and Zustand store.
- Added TypeScript project config (`frontend/tsconfig.json`, `frontend/tsconfig.node.json`).
- Added `typecheck` script (`tsc --noEmit`) and TypeScript dev dependency.
- Updated entrypoint to `frontend/src/main.tsx`.

## Commands
- Dev: `npm run dev`
- Typecheck: `npm run typecheck`
- Build: `npm run build`

