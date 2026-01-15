from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, DateTime, JSON
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Experiment(Base):
    __tablename__ = "experiments"

    # Primary key
    id = Column(Integer, primary_key=True, autoincrement=True)

    # Configuration (from ResetRequest)
    seed = Column(Integer, nullable=True)
    n_jobs = Column(Integer, nullable=False)
    n_stations = Column(Integer, nullable=False)
    buffer_caps = Column(JSON, nullable=False)
    proc_means = Column(JSON, nullable=False)
    proc_dists = Column(JSON, nullable=False)
    util_alpha = Column(Float, nullable=False)
    fail_rate = Column(Float, nullable=False)
    repair_time = Column(Float, nullable=False)
    workers = Column(Integer, nullable=False)

    # Results (from SummaryModel) - nullable until run completes
    total_jobs = Column(Integer, nullable=True)
    jobs_completed = Column(Integer, nullable=True)
    makespan = Column(Float, nullable=True)
    avg_wip = Column(Float, nullable=True)
    avg_util = Column(Float, nullable=True)
    throughput_rate = Column(Float, nullable=True)
    down_stations = Column(Integer, nullable=True)
    workers_available = Column(Integer, nullable=True)
    workers_total = Column(Integer, nullable=True)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="running")
