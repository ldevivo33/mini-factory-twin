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

## Rust Simulator Migration (Implemented)
- Added Rust PyO3 crate at `rust-sim/` (`mft_rust_sim` module).
- Added Python Rust adapter at `backend/sim/rust_bridge.py`.
- `backend/sim/factory_sim.py` now selects backend via `MFT_SIM_BACKEND`:
  - `auto` (default): Rust when installed, Python fallback otherwise
  - `rust`: require Rust extension
  - `python`: force legacy Python DES
- Preserved Python simulator as fallback at `backend/sim/factory_sim_py.py`.
- Kept RL in Python and fixed Gym termination conditions in `backend/rl/factory_env.py`.
- Added Python training entrypoint `backend/rl/train_sb3.py` (random + optional PPO).

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
- Rust extension build: `cd rust-sim && maturin develop --release`
- RL random baseline: `python -m backend.rl.train_sb3 --mode random --backend auto`
- RL PPO (optional): `python -m backend.rl.train_sb3 --mode ppo --backend auto`
