from typing import Any, Dict, Optional, List, Union

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.sim.factory_sim import FactorySim


# ----------------------
# Pydantic schemas (DES-first)
# ----------------------


class StationModel(BaseModel):
    status: int
    remaining: float
    util_ema: float
    starved: bool
    blocked: bool


class SnapshotModel(BaseModel):
    t: float
    t_start: float
    t_end: float
    event: Optional[dict]
    buffers: Dict[str, int]
    stations: List[StationModel]
    throughput: int
    wip: int
    blocked: int
    starved: int
    avg_processing_time: float
    avg_processing_speed: float


class ResetRequest(BaseModel):
    seed: Optional[int] = None
    n_jobs: int = 100
    n_stations: int = 3
    buffer_caps: List[int] = Field(default_factory=lambda: [5, 5])
    proc_means: List[float] = Field(default_factory=lambda: [4.0, 5.0, 4.5])
    proc_dists: Union[str, List[str]] = "uniform"
    util_alpha: float = 0.1


class StepRequest(BaseModel):
    speed_mult: float = 1.0  # control action applied before advancing to next event


class SummaryModel(BaseModel):
    total_jobs: int
    jobs_completed: int
    makespan: float
    avg_wip: float
    avg_util: float
    throughput_rate: float


class ServerState:
    def __init__(self) -> None:
        self.sim: Optional[FactorySim] = None
        self._config: Dict[str, Any] = {}


# ----------------------
# FastAPI app and routes
# ----------------------

state = ServerState()

app = FastAPI(title="Mini Factory Twin — DES", version="0.2.0")

# Enable CORS for local frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/sim/reset", response_model=SnapshotModel)
def sim_reset(req: ResetRequest):
    # Instantiate sim from request config
    buffer_caps = req.buffer_caps
    if isinstance(req.proc_dists, list):
        proc_dists = req.proc_dists
    else:
        proc_dists = req.proc_dists
    state.sim = FactorySim(
        n_stations=req.n_stations,
        buffer_caps=buffer_caps,
        proc_means=req.proc_means,
        proc_dists=proc_dists,
        util_alpha=req.util_alpha,
    )
    snap = state.sim.reset(seed=req.seed, n_jobs=req.n_jobs)
    return SnapshotModel(**snap)


@app.post("/sim/step", response_model=SnapshotModel)
def sim_step(req: StepRequest):
    if state.sim is None:
        # Initialize default sim if not yet created
        state.sim = FactorySim()
        state.sim.reset(seed=None, n_jobs=100)
    state.sim.apply_action(speed_mult=float(req.speed_mult))
    snap = state.sim.run_until_next_decision()
    return SnapshotModel(**snap)


@app.get("/sim/state", response_model=SnapshotModel)
def sim_state():
    if state.sim is None:
        state.sim = FactorySim()
        state.sim.reset()
    snap = state.sim.get_snapshot()
    return SnapshotModel(**snap)


@app.post("/sim/run_to_finish", response_model=SummaryModel)
def sim_run_to_finish():
    if state.sim is None:
        state.sim = FactorySim()
        state.sim.reset()
    summary = state.sim.run_to_finish()
    return SummaryModel(**summary)


@app.get("/sim/summary", response_model=SummaryModel)
def sim_summary():
    if state.sim is None:
        state.sim = FactorySim()
        state.sim.reset()
    summary = state.sim.get_summary()
    return SummaryModel(**summary)
