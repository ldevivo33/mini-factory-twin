from __future__ import annotations

from typing import Dict, Optional, Sequence, Union


class RustFactorySim:
    """
    Python adapter around the PyO3 extension class.

    This class mirrors the existing FactorySim API so the FastAPI layer and
    Gymnasium environment can continue using the same interface.
    """

    EVT_SERVICE_COMPLETE = "service_complete"
    EVT_MACHINE_FAILURE = "machine_failure"
    EVT_REPAIR_COMPLETE = "repair_complete"

    def __init__(
        self,
        n_stations: int = 3,
        buffer_caps: Union[int, Sequence[int]] = (5, 5),
        proc_means: Sequence[float] = (4.0, 5.0, 4.5),
        proc_dists: Union[str, Sequence[str]] = "uniform",
        util_alpha: float = 0.1,
        fail_rate: float = 0.01,
        repair_time: float = 60.0,
        workers: int = 3,
    ) -> None:
        import mft_rust_sim  # type: ignore

        self.n_stations = int(n_stations)
        if self.n_stations < 1:
            raise ValueError("n_stations must be >= 1")

        if isinstance(buffer_caps, int):
            norm_caps = [int(buffer_caps)] * max(0, self.n_stations - 1)
        else:
            norm_caps = [int(v) for v in buffer_caps]
        if len(norm_caps) != max(0, self.n_stations - 1):
            raise ValueError("buffer_caps length must be n_stations-1")

        norm_means = [float(v) for v in proc_means]
        if len(norm_means) != self.n_stations:
            raise ValueError("proc_means length must equal n_stations")

        if isinstance(proc_dists, str):
            norm_dists = [proc_dists] * self.n_stations
        else:
            norm_dists = [str(v) for v in proc_dists]
        if len(norm_dists) != self.n_stations:
            raise ValueError("proc_dists length must equal n_stations")

        self._inner = mft_rust_sim.FactorySim(
            self.n_stations,
            norm_caps,
            norm_means,
            norm_dists,
            float(util_alpha),
            float(fail_rate),
            float(repair_time),
            int(workers),
        )

    def __getattr__(self, name: str):
        return getattr(self._inner, name)

    def reset(self, seed: Optional[int] = None, n_jobs: int = 100):
        return dict(self._inner.reset(seed, int(n_jobs)))

    def apply_action(self, speed_mult: Optional[float] = None) -> None:
        self._inner.apply_action(None if speed_mult is None else float(speed_mult))

    def run_until_next_decision(self):
        return dict(self._inner.run_until_next_decision())

    def get_snapshot(self):
        return dict(self._inner.get_snapshot())

    def run_to_finish(self):
        return dict(self._inner.run_to_finish())

    def get_summary(self):
        return dict(self._inner.get_summary())

    def compute_reward(self, snapshot: Dict[str, object]) -> float:
        throughput = int(snapshot.get("throughput", 0))
        wip = int(snapshot.get("wip", 0))
        stations = snapshot.get("stations", [])
        starved = 0
        blocked = 0
        if isinstance(stations, list):
            for st in stations:
                if isinstance(st, dict):
                    starved += 1 if bool(st.get("starved", False)) else 0
                    blocked += 1 if bool(st.get("blocked", False)) else 0
        return float(throughput) - 0.05 * float(wip) - 0.1 * float(blocked + starved)

    def step(self, speed_mult: float = 1.0):
        self.apply_action(speed_mult=speed_mult)
        snap = self.run_until_next_decision()
        reward = float(self.compute_reward(snap))
        return snap, reward
