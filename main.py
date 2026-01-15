from datetime import datetime
from typing import Any, Dict, Optional, List, Union

from dotenv import load_dotenv
load_dotenv("DB.env")

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.sim.factory_sim import FactorySim
from backend.db.models import Base, Experiment
from backend.db.session import engine, get_db


# ----------------------
# Pydantic schemas (DES-first)
# ----------------------


class StationModel(BaseModel):
    status: int
    remaining: float
    util_ema: float
    starved: bool
    blocked: bool
    down: bool
    repairing: bool
    repair_remaining: float


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
    down: int
    workers_available: int
    workers_total: int
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
    fail_rate: float = 0.01
    repair_time: float = 60.0
    workers: int = 3


class StepRequest(BaseModel):
    speed_mult: float = 1.0  # control action applied before advancing to next event


class SummaryModel(BaseModel):
    total_jobs: int
    jobs_completed: int
    makespan: float
    avg_wip: float
    avg_util: float
    throughput_rate: float
    down_stations: int
    workers_available: int
    workers_total: int


class ExperimentListItem(BaseModel):
    id: int
    seed: Optional[int]
    n_jobs: int
    n_stations: int
    status: str
    created_at: datetime
    completed_at: Optional[datetime]
    makespan: Optional[float]
    throughput_rate: Optional[float]

    class Config:
        from_attributes = True


class ExperimentDetail(BaseModel):
    id: int
    seed: Optional[int]
    n_jobs: int
    n_stations: int
    buffer_caps: List[int]
    proc_means: List[float]
    proc_dists: List[str]
    util_alpha: float
    fail_rate: float
    repair_time: float
    workers: int
    total_jobs: Optional[int]
    jobs_completed: Optional[int]
    makespan: Optional[float]
    avg_wip: Optional[float]
    avg_util: Optional[float]
    throughput_rate: Optional[float]
    down_stations: Optional[int]
    workers_available: Optional[int]
    workers_total: Optional[int]
    created_at: datetime
    completed_at: Optional[datetime]
    status: str

    class Config:
        from_attributes = True


class ServerState:
    def __init__(self) -> None:
        self.sim: Optional[FactorySim] = None
        self._config: Dict[str, Any] = {}
        self.current_experiment_id: Optional[int] = None


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


@app.on_event("startup")
def startup_event():
    Base.metadata.create_all(bind=engine)


@app.post("/sim/reset", response_model=SnapshotModel)
def sim_reset(req: ResetRequest, db: Session = Depends(get_db)):
    # Instantiate sim from request config
    buffer_caps = req.buffer_caps
    if isinstance(req.proc_dists, list):
        proc_dists = req.proc_dists
    else:
        proc_dists = [req.proc_dists] * req.n_stations
    state.sim = FactorySim(
        n_stations=req.n_stations,
        buffer_caps=buffer_caps,
        proc_means=req.proc_means,
        proc_dists=proc_dists,
        util_alpha=req.util_alpha,
        fail_rate=req.fail_rate,
        repair_time=req.repair_time,
        workers=req.workers,
    )
    snap = state.sim.reset(seed=req.seed, n_jobs=req.n_jobs)

    # Create experiment record
    experiment = Experiment(
        seed=req.seed,
        n_jobs=req.n_jobs,
        n_stations=req.n_stations,
        buffer_caps=req.buffer_caps,
        proc_means=req.proc_means,
        proc_dists=proc_dists,
        util_alpha=req.util_alpha,
        fail_rate=req.fail_rate,
        repair_time=req.repair_time,
        workers=req.workers,
        status="running",
    )
    db.add(experiment)
    db.commit()
    db.refresh(experiment)
    state.current_experiment_id = experiment.id

    return SnapshotModel(**snap)


@app.post("/sim/step", response_model=SnapshotModel)
def sim_step(req: StepRequest, db: Session = Depends(get_db)):
    if state.sim is None:
        # Initialize default sim if not yet created
        state.sim = FactorySim()
        state.sim.reset(seed=None, n_jobs=100)
    state.sim.apply_action(speed_mult=float(req.speed_mult))
    snap = state.sim.run_until_next_decision()

    # Check if simulation completed and update experiment
    if (
        state.current_experiment_id
        and state.sim.jobs_completed >= state.sim.jobs_total
    ):
        experiment = db.query(Experiment).filter(
            Experiment.id == state.current_experiment_id
        ).first()
        if experiment and experiment.status == "running":
            summary = state.sim.get_summary()
            experiment.total_jobs = summary["total_jobs"]
            experiment.jobs_completed = summary["jobs_completed"]
            experiment.makespan = summary["makespan"]
            experiment.avg_wip = summary["avg_wip"]
            experiment.avg_util = summary["avg_util"]
            experiment.throughput_rate = summary["throughput_rate"]
            experiment.down_stations = summary["down_stations"]
            experiment.workers_available = summary["workers_available"]
            experiment.workers_total = summary["workers_total"]
            experiment.status = "completed"
            experiment.completed_at = datetime.utcnow()
            db.commit()
            state.current_experiment_id = None  # Clear so we don't update again

    return SnapshotModel(**snap)


@app.get("/sim/state", response_model=SnapshotModel)
def sim_state():
    if state.sim is None:
        state.sim = FactorySim()
        state.sim.reset()
    snap = state.sim.get_snapshot()
    return SnapshotModel(**snap)


@app.post("/sim/run_to_finish", response_model=SummaryModel)
def sim_run_to_finish(db: Session = Depends(get_db)):
    if state.sim is None:
        state.sim = FactorySim()
        state.sim.reset()
    summary = state.sim.run_to_finish()

    # Update experiment record with results
    if state.current_experiment_id:
        experiment = db.query(Experiment).filter(
            Experiment.id == state.current_experiment_id
        ).first()
        if experiment:
            experiment.total_jobs = summary["total_jobs"]
            experiment.jobs_completed = summary["jobs_completed"]
            experiment.makespan = summary["makespan"]
            experiment.avg_wip = summary["avg_wip"]
            experiment.avg_util = summary["avg_util"]
            experiment.throughput_rate = summary["throughput_rate"]
            experiment.down_stations = summary["down_stations"]
            experiment.workers_available = summary["workers_available"]
            experiment.workers_total = summary["workers_total"]
            experiment.status = "completed"
            experiment.completed_at = datetime.utcnow()
            db.commit()

    return SummaryModel(**summary)


@app.get("/sim/summary", response_model=SummaryModel)
def sim_summary():
    if state.sim is None:
        state.sim = FactorySim()
        state.sim.reset()
    summary = state.sim.get_summary()
    return SummaryModel(**summary)


# ----------------------
# Experiment endpoints
# ----------------------


@app.get("/experiments", response_model=List[ExperimentListItem])
def list_experiments(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    experiments = (
        db.query(Experiment)
        .order_by(Experiment.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return experiments


@app.get("/experiments/{experiment_id}", response_model=ExperimentDetail)
def get_experiment(experiment_id: int, db: Session = Depends(get_db)):
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


@app.delete("/experiments/{experiment_id}")
def delete_experiment(experiment_id: int, db: Session = Depends(get_db)):
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")
    db.delete(experiment)
    db.commit()
    return {"message": f"Experiment {experiment_id} deleted"}


@app.delete("/experiments")
def delete_stale_experiments(db: Session = Depends(get_db)):
    """Delete all experiments with status 'running' (stale/incomplete)."""
    result = db.query(Experiment).filter(Experiment.status == "running").delete()
    db.commit()
    return {"message": f"Deleted {result} stale experiments"}
