# mini-factory-twin

AI-driven factory twin for assembly-line simulation, 3D visualization, and RL control.

## Architecture

- Backend API: Python (`FastAPI`, `SQLAlchemy`, `Pydantic`)
- Simulator:
  - Rust DES engine (`rust-sim`, PyO3 module `mft_rust_sim`)
  - Python DES fallback (`backend/sim/factory_sim_py.py`)
- RL environment/training: Python (`gymnasium`, optional `stable-baselines3`)
- Frontend: TypeScript + React + Three.js + Vite

## Backend Simulator Selection

Set `MFT_SIM_BACKEND`:

- `auto` (default): use Rust extension if available, else Python fallback
- `rust`: require Rust extension, fail if unavailable
- `python`: force Python simulator

## Rust Simulator Build

From repo root:

```bash
cd rust-sim
pip install maturin
maturin develop --release
```

This installs the `mft_rust_sim` Python extension into your active environment.

## Python RL Training

Random rollout baseline:

```bash
python -m backend.rl.train_sb3 --mode random --backend auto --episodes 3
```

PPO training (optional):

```bash
pip install stable-baselines3
python -m backend.rl.train_sb3 --mode ppo --backend auto --timesteps 5000
```

## Frontend

```bash
cd frontend
npm install
npm run typecheck
npm run build
npm run dev
```

