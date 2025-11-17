from __future__ import annotations

import heapq
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np


@dataclass
class _Station:
    status: str = "idle"  # 'idle' | 'working' | 'blocked' | 'down'
    starved: bool = False
    end_time: Optional[float] = None
    util_ema: float = 0.0
    has_finished_part: bool = False  # true if blocked with finished part not yet transferred
    job_id: Optional[int] = None
    repairing: bool = False
    repair_eta: Optional[float] = None


class FactorySim:
    """
    Discrete-event simulation (DES) kernel for a serial production line.

    - Stations S1..Sn connected by finite buffers.
    Internal event queue schedules service completions.
    - Supports finite job datasets and automatic run-to-completion.
    """

    # Event types
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
        assert n_stations >= 1, "Need at least one station"
        self.n_stations = int(n_stations)
        # Buffers between stations (n_stations-1)
        if isinstance(buffer_caps, int):
            self.buffer_caps = [int(buffer_caps)] * max(0, self.n_stations - 1)
        else:
            caps = list(buffer_caps)
            assert len(caps) == max(0, self.n_stations - 1), "buffer_caps length must be n_stations-1"
            self.buffer_caps = [int(c) for c in caps]
        # Processing time parameters
        means = list(proc_means)
        assert len(means) == self.n_stations, "proc_means length must equal n_stations"
        self.proc_means = [float(m) for m in means]
        if isinstance(proc_dists, str):
            self.proc_dists = [proc_dists] * self.n_stations
        else:
            dists = list(proc_dists)
            assert len(dists) == self.n_stations, "proc_dists length must equal n_stations"
            self.proc_dists = dists
        self.util_alpha = float(util_alpha)
        self.fail_rate = float(fail_rate)
        self.repair_time = float(repair_time)
        self.workers_total = int(workers)
        self.workers_available = self.workers_total
        self.repair_queue: List[int] = []

        # RNG and state
        self.rng: Optional[np.random.Generator] = None
        self.time: float = 0.0
        self._event_queue: List[Tuple[float, int, str, int]] = []  # (t, seq, type, station)
        self._seq: int = 0
        self._current_speed: float = 1.0

        # Finite job dataset tracking
        self.jobs_total: int = 0
        self.jobs_completed: int = 0
        self.job_queue: List[int] = []
        self._wip_history: List[int] = []
        self._record_history: bool = True

        # Line state
        self.buffers: List[int] = []  # counts per buffer
        self.stations: List[_Station] = []
        self._throughput_total: int = 0

    # ---------------- Public API ----------------
    def reset(self, seed: Optional[int] = None, n_jobs: int = 100):
        """Reset simulation with a finite number of jobs waiting before Station 1."""
        self.rng = np.random.default_rng(seed)
        self.time = 0.0
        self._event_queue.clear()
        self._seq = 0
        self._current_speed = 1.0
        self._throughput_total = 0
        self._throughput_since_decision: int = 0
        self.workers_available = self.workers_total
        self.repair_queue = []
        self.buffers = [0 for _ in range(max(0, self.n_stations - 1))]
        self.stations = [_Station() for _ in range(self.n_stations)]

        # finite job setup
        self.jobs_total = int(n_jobs)
        self.jobs_completed = 0
        self.job_queue = list(range(self.jobs_total))
        self._wip_history = []

        # decision/event bookkeeping for snapshots
        self._t_last_decision: float = 0.0
        self._last_event_type: Optional[str] = None
        self._last_event_sid: Optional[int] = None

        # start first jobs and return initial snapshot
        self.apply_action()
        return self.get_snapshot()

    def apply_action(self, speed_mult: Optional[float] = None) -> None:
        """Apply control decisions at a decision boundary.

        Current control: set global speed multiplier and greedily start all
        stations that can start given current buffer availability. Any blocked
        finished parts are transferred first when space exists.
        """
        if speed_mult is not None:
            self._current_speed = float(speed_mult)
        
        # Greedy resolution loop at current time (no time advance)
        while True:
            progress = False
            # 1) Clear blocked transfers left->right where space exists
            for i in range(self.n_stations):
                st = self.stations[i]
                if st.status == "blocked" and st.has_finished_part:
                    if i == self.n_stations - 1:
                        # Last station: depart system
                        st.status = "idle"
                        st.has_finished_part = False
                        self._throughput_total += 1
                        self._throughput_since_decision = getattr(self, "_throughput_since_decision", 0) + 1
                        progress = True
                    else:
                        if self.buffers[i] < self.buffer_caps[i]:
                            self.buffers[i] += 1
                            st.status = "idle"
                            st.has_finished_part = False
                            progress = True
            # 2) Start stations where possible (left->right)
            for i in range(self.n_stations):
                st = self.stations[i]
                if st.status == "idle":
                    if i == 0:
                        can_pull = len(self.job_queue) > 0
                    else:
                        can_pull = self.buffers[i - 1] > 0
                    if can_pull:
                        job_id: Optional[int] = None
                        if i == 0:
                            job_id = self.job_queue.pop(0)
                        else:
                            self.buffers[i - 1] -= 1
                        st.job_id = job_id
                        st.starved = False
                        st.status = "working"
                        dur = self._sample_proc_time(i, self._current_speed)
                        st.end_time = self.time + dur
                        self._schedule(st.end_time, self.EVT_SERVICE_COMPLETE, i)
                        if self.rng is not None and self.rng.random() < self.fail_rate:
                            fail_time = self.time + self.rng.uniform(0.0, dur)
                            self._schedule(fail_time, self.EVT_MACHINE_FAILURE, i)
                        progress = True
                    else:
                        st.starved = True
            if not progress:
                break

    def run_until_next_decision(self) -> Dict[str, Union[int, float, Dict[str, int], List[Dict[str, Union[int, float, bool]]]]]:
        """Advance to the next decision event (e.g., a service completion) and return a snapshot."""
        self._throughput_since_decision = 0
        while self._event_queue:
            t, _, etype, sid = heapq.heappop(self._event_queue)
            self._advance_time(t)
            handled = False
            if etype == self.EVT_SERVICE_COMPLETE:
                handled = self._handle_service_complete(sid)
            elif etype == self.EVT_MACHINE_FAILURE:
                handled = self._handle_machine_failure(sid)
            elif etype == self.EVT_REPAIR_COMPLETE:
                handled = self._handle_repair_complete(sid)
            if handled:
                self._last_event_type = etype
                self._last_event_sid = sid
                self.apply_action()
                break
        snap = self.get_snapshot()
        self._t_last_decision = float(self.time)
        return snap

    def get_snapshot(self) -> Dict[str, Union[int, float, Dict[str, int], List[Dict[str, Union[int, float, bool]]]]]:
        buffers_dict: Dict[str, int] = {f"b{i+1}{i+2}": int(self.buffers[i]) for i in range(len(self.buffers))}
        stations_list: List[Dict[str, Union[int, float, bool]]] = []
        working = 0
        blocked = 0
        starved = 0
        down = 0
        avg_proc_time = float(sum(self.proc_means) / len(self.proc_means)) if self.proc_means else 0.0
        avg_proc_speed = float(1.0 / avg_proc_time) if avg_proc_time > 0 else 0.0
        for st in self.stations:
            if st.status == "idle":
                status_code = 0
            elif st.status == "working":
                status_code = 1
            elif st.status == "blocked":
                status_code = 2
            else:
                status_code = 3
            remaining = max(0.0, (st.end_time or self.time) - self.time) if st.status == "working" else 0.0
            repair_remaining = 0.0
            if st.repair_eta is not None and st.status == "down":
                repair_remaining = max(0.0, st.repair_eta - self.time)
            stations_list.append({
                "status": status_code,
                "remaining": float(remaining),
                "util_ema": float(st.util_ema),
                "starved": bool(st.starved),
                "blocked": bool(st.status == "blocked"),
                "down": bool(st.status == "down"),
                "repairing": bool(st.repairing),
                "repair_remaining": float(repair_remaining),
            })
            if st.status == "working":
                working += 1
            if st.status == "blocked":
                blocked += 1
            if st.starved:
                starved += 1
            if st.status == "down":
                down += 1
        wip = int(sum(self.buffers) + working + blocked)
        return {
            "t": float(self.time),
            "t_start": float(getattr(self, "_t_last_decision", 0.0)),
            "t_end": float(self.time),
            "event": {"type": getattr(self, "_last_event_type", None), "station": getattr(self, "_last_event_sid", None)},
            "buffers": buffers_dict,
            "stations": stations_list,
            "throughput": int(getattr(self, "_throughput_since_decision", 0)),
            "wip": int(wip),
            "blocked": int(blocked),
            "starved": int(starved),
            "down": int(down),
            "workers_available": int(self.workers_available),
            "workers_total": int(self.workers_total),
            "avg_processing_time": float(avg_proc_time),
            "avg_processing_speed": float(avg_proc_speed),
        }

    def compute_reward(self, snapshot: Dict[str, Union[int, float, Dict[str, int], List[Dict[str, Union[int, float, bool]]]]]) -> float:
        throughput = int(snapshot.get("throughput", 0))
        wip = int(snapshot.get("wip", 0))
        stations = snapshot.get("stations", [])  # type: ignore
        starved = sum(1 for s in stations if bool(s.get("starved", False)))  # type: ignore
        blocked = sum(1 for s in stations if bool(s.get("blocked", False)))  # type: ignore
        return float(throughput) - 0.05 * float(wip) - 0.1 * float(blocked + starved)

    # Convenience for RL/visualization wrappers
    def step(self, speed_mult: float = 1.0):
        """Apply speed, advance to next decision, return (snapshot, reward)."""
        self.apply_action(speed_mult)
        snap = self.run_until_next_decision()
        reward = float(self.compute_reward(snap))
        return snap, reward

    def run_to_finish(self) -> Dict[str, Union[int, float]]:
        """Run the simulation until all jobs are completed."""
        while self.jobs_completed < self.jobs_total and self._event_queue:
            t, _, etype, sid = heapq.heappop(self._event_queue)
            self._advance_time(t)
            handled = False
            if etype == self.EVT_SERVICE_COMPLETE:
                handled = self._handle_service_complete(sid)
            elif etype == self.EVT_MACHINE_FAILURE:
                handled = self._handle_machine_failure(sid)
            elif etype == self.EVT_REPAIR_COMPLETE:
                handled = self._handle_repair_complete(sid)

            if handled:
                if self._record_history:
                    wip = sum(self.buffers) + sum(1 for s in self.stations if s.status != "idle")
                    self._wip_history.append(wip)

                # IMPORTANT: after each event, greedily start what can run
                self.apply_action()

        return self.get_summary()

    # ---------------- Internal helpers ----------------
    def _schedule(self, t: float, etype: str, sid: int) -> None:
        heapq.heappush(self._event_queue, (float(t), self._seq, etype, int(sid)))
        self._seq += 1

    def _advance_time(self, to_time: float) -> None:
        to_time = float(to_time)
        if to_time < self.time:
            return
        dt = to_time - self.time
        if dt > 0:
            decay = (1.0 - self.util_alpha) ** dt
            for st in self.stations:
                busy = 1.0 if st.status == "working" else 0.0
                st.util_ema = st.util_ema * decay + (1.0 - decay) * busy
        self.time = to_time

    def _sample_proc_time(self, station_idx: int, speed: float) -> float:
        mean = self.proc_means[station_idx]
        dist = self.proc_dists[station_idx]
        if dist == "exp":
            base = float(self.rng.exponential(scale=mean))
        else:
            base = float(self.rng.uniform(0.0, 2.0 * mean))
        return max(0.01, base / max(1e-6, float(speed)))

    def _handle_service_complete(self, sid: int) -> bool:
        st = self.stations[sid]
        if st.status != "working" or st.end_time is None or abs(st.end_time - self.time) > 1e-9:
            return False
        st.status = "idle"
        st.end_time = self.time
        st.job_id = None
        if sid == self.n_stations - 1:
            self._throughput_total += 1
            self._throughput_since_decision = getattr(self, "_throughput_since_decision", 0) + 1
            st.has_finished_part = False
            self.jobs_completed += 1
        else:
            if self.buffers[sid] < self.buffer_caps[sid]:
                self.buffers[sid] += 1
                st.has_finished_part = False
            else:
                st.status = "blocked"
                st.has_finished_part = True
        return True

    def _handle_machine_failure(self, sid: int) -> bool:
        if sid < 0 or sid >= self.n_stations:
            return False
        st = self.stations[sid]
        if st.status != "working":
            return False
        if sid == 0:
            if st.job_id is not None:
                self.job_queue.insert(0, st.job_id)
                st.job_id = None
        else:
            self.buffers[sid - 1] += 1
        st.status = "down"
        st.starved = False
        st.has_finished_part = False
        st.end_time = None
        st.repairing = False
        st.repair_eta = None
        if self.workers_available > 0:
            self._assign_repair_worker(sid)
        else:
            if sid not in self.repair_queue:
                self.repair_queue.append(sid)
        return True

    def _handle_repair_complete(self, sid: int) -> bool:
        if sid < 0 or sid >= self.n_stations:
            return False
        st = self.stations[sid]
        if st.status != "down":
            return False
        st.status = "idle"
        st.starved = False
        st.has_finished_part = False
        st.end_time = None
        st.repairing = False
        st.repair_eta = None
        self.workers_available = min(self.workers_available + 1, self.workers_total)
        if self.repair_queue:
            next_sid = self.repair_queue.pop(0)
            if not self._assign_repair_worker(next_sid):
                self.repair_queue.insert(0, next_sid)
        return True

    def _assign_repair_worker(self, sid: int) -> bool:
        if sid < 0 or sid >= self.n_stations:
            return False
        if self.workers_available <= 0:
            return False
        st = self.stations[sid]
        if st.status != "down" or st.repairing:
            return False
        st.repairing = True
        st.repair_eta = self.time + self.repair_time
        self.workers_available -= 1
        self._schedule(st.repair_eta, self.EVT_REPAIR_COMPLETE, sid)
        return True

    def get_summary(self) -> Dict[str, float]:
        total_time = float(self.time)
        avg_wip = float(np.mean(self._wip_history)) if self._wip_history else 0.0
        avg_util = float(np.mean([s.util_ema for s in self.stations])) if self.stations else 0.0
        throughput_rate = self.jobs_completed / total_time if total_time > 0 else 0.0
        down_stations = sum(1 for s in self.stations if s.status == "down")
        return {
            "total_jobs": self.jobs_total,
            "jobs_completed": self.jobs_completed,
            "makespan": total_time,
            "avg_wip": avg_wip,
            "avg_util": avg_util,
            "throughput_rate": throughput_rate,
            "down_stations": down_stations,
            "workers_available": self.workers_available,
            "workers_total": self.workers_total,
        }
