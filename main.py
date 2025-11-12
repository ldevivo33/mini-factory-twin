import os
import time
import uuid

from dotenv import load_dotenv

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import JSON, BigInteger, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from sqlalchemy import create_engine

from backend.factory_env import MiniFactoryEnv


# ----------------------
# Database setup (PostgreSQL expected)
# ----------------------

load_dotenv(dotenv_path="DB.env")
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Sensible default placeholder; user should set DATABASE_URL.
    DATABASE_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/minifactory"

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


# ----------------------
# SQLAlchemy models
# ----------------------

class Run(Base):
    __tablename__ = "runs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    algo = Column(String, nullable=False, default="manual")
    env_version = Column(String, nullable=False, default="mvp-0.1")
    config = Column(JSONB if engine.url.get_backend_name().startswith("postgres") else JSON, nullable=False, default=dict)

    episodes = relationship("Episode", back_populates="run")


class Episode(Base):
    __tablename__ = "episodes"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("runs.id"), nullable=False, index=True)
    seed = Column(Integer, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    ended_at = Column(DateTime(timezone=True), nullable=True)
    reward_sum = Column(Float, nullable=False, default=0.0)
    steps = Column(Integer, nullable=False, default=0)

    run = relationship("Run", back_populates="episodes")
    steps_rel = relationship("Step", back_populates="episode")


class Step(Base):
    __tablename__ = "steps"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    episode_id = Column(UUID(as_uuid=True), ForeignKey("episodes.id"), nullable=False, index=True)
    t = Column(Integer, nullable=False)
    action = Column(Integer, nullable=False)
    reward = Column(Float, nullable=False)
    obs = Column(JSONB if engine.url.get_backend_name().startswith("postgres") else JSON, nullable=False)
    info = Column(JSONB if engine.url.get_backend_name().startswith("postgres") else JSON, nullable=False)

    episode = relationship("Episode", back_populates="steps_rel")


# MVP: auto-create tables if Alembic not run yet
Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ----------------------
# Pydantic schemas
# ----------------------


class StationModel(BaseModel):
    status: int
    remaining: float
    util_ema: float
    starved: bool
    blocked: bool


class SimInfoModel(BaseModel):
    t: int
    buffers: Dict[str, int]
    stations: list[StationModel]
    throughput: int
    reward: float
    action: int


class ResetRequest(BaseModel):
    seed: Optional[int] = None


class ResetResponse(BaseModel):
    obs: list[float]
    info: SimInfoModel
    session_id: str


class StepRequest(BaseModel):
    action: int = Field(ge=0, le=2)
    session_id: Optional[str] = "default"


class StepResponse(BaseModel):
    obs: list[float]
    reward: float
    terminated: bool
    truncated: bool
    info: SimInfoModel


class StateResponse(BaseModel):
    obs: list[float]
    info: SimInfoModel


# ----------------------
# App state and helpers
# ----------------------


class ServerState:
    def __init__(self) -> None:
        self.session_id = "default"
        self.env = MiniFactoryEnv()
        self.last_obs, info = self.env.reset()
        # DB tracking
        self.run_id: Optional[uuid.UUID] = None
        self.episode_id: Optional[uuid.UUID] = None
        self.reward_sum: float = 0.0
        self.step_count: int = 0
        # Rate limiting
        self._last_step_ts: float = 0.0

    def now(self) -> datetime:
        return datetime.now(timezone.utc)


state = ServerState()


def ensure_run(db) -> uuid.UUID:
    if state.run_id is not None:
        return state.run_id
    run = Run(algo="manual", env_version="mvp-0.1", config={})
    db.add(run)
    db.commit()
    db.refresh(run)
    state.run_id = run.id
    return run.id


def start_episode(db, seed: Optional[int]) -> uuid.UUID:
    run_id = ensure_run(db)
    # Close previous episode if open
    if state.episode_id is not None:
        ep = db.get(Episode, state.episode_id)
        if ep and ep.ended_at is None:
            ep.ended_at = state.now()
            ep.reward_sum = state.reward_sum
            ep.steps = state.step_count
            db.add(ep)
            db.commit()
    # New episode
    ep = Episode(run_id=run_id, seed=seed, started_at=state.now())
    db.add(ep)
    db.commit()
    db.refresh(ep)
    state.episode_id = ep.id
    state.reward_sum = 0.0
    state.step_count = 0
    return ep.id


def persist_step(db, info: Dict[str, Any], obs: list[float], action: int, reward: float) -> None:
    if state.episode_id is None:
        return
    rec = Step(
        episode_id=state.episode_id,
        t=int(info.get("t", state.step_count)),
        action=int(action),
        reward=float(reward),
        obs=obs,
        info=info,
    )
    db.add(rec)
    db.commit()


# ----------------------
# FastAPI app and routes
# ----------------------


app = FastAPI(title="Mini Factory Twin", version="0.1.0")

# Enable CORS for local frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/reset", response_model=ResetResponse)
def api_reset(req: ResetRequest, db=Depends(get_db)):
    seed = req.seed
    start_episode(db, seed)
    obs, info = state.env.reset(seed=seed)
    state.last_obs = obs.tolist()
    return ResetResponse(obs=state.last_obs, info=SimInfoModel(**info), session_id=state.session_id)


@app.post("/step", response_model=StepResponse)
def api_step(req: StepRequest, db=Depends(get_db)):
    if req.session_id != state.session_id:
        raise HTTPException(status_code=404, detail="Unknown session_id")

    # Simple rate limiting: ignore extra steps within 200ms
    now_ts = time.monotonic()
    if now_ts - state._last_step_ts < 0.2:
        # Return current state without stepping
        info = state.env.get_state()
        return StepResponse(
            obs=info["obs"],
            reward=info.get("reward", 0.0),
            terminated=False,
            truncated=False,
            info=SimInfoModel(**info),
        )
    state._last_step_ts = now_ts

    obs, reward, terminated, truncated, info = state.env.step(req.action)
    state.last_obs = obs.tolist()
    state.reward_sum += float(reward)
    state.step_count += 1

    # Persist step
    persist_step(db, info, state.last_obs, req.action, reward)

    return StepResponse(
        obs=state.last_obs,
        reward=float(reward),
        terminated=bool(terminated),
        truncated=bool(truncated),
        info=SimInfoModel(**info),
    )


@app.get("/state", response_model=StateResponse)
def api_state():
    info = state.env.get_state()
    return StateResponse(obs=info["obs"], info=SimInfoModel(**info))
