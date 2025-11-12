from __future__ import annotations

from typing import Any, Dict, Optional, Sequence, Tuple, Union

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from backend.sim.factory_sim import FactorySim


class MiniFactoryEnv(gym.Env):
    """
    Gymnasium wrapper around the SimPy-based FactorySim.

    - Actions: Discrete speed multipliers [0.8, 1.0, 1.2]
    - Observations: [normalized buffers..., station util_ema...]
    - Reward: throughput - 0.05 * WIP - 0.1 * (blocked + starved)
    """

    metadata = {"render_modes": []}

    def __init__(
        self,
        *,
        n_stations: int = 3,
        buffer_caps: Union[int, Sequence[int]] = (5, 5),
        proc_means: Sequence[float] = (4.0, 5.0, 4.5),
        proc_dists: Union[str, Sequence[str]] = "uniform",
        util_alpha: float = 0.1,
        seed: Optional[int] = None,
    ) -> None:
        super().__init__()
        self.n_stations = int(n_stations)
        if isinstance(buffer_caps, int):
            self.buffer_caps = [int(buffer_caps)] * max(0, self.n_stations - 1)
        else:
            caps = list(buffer_caps)
            assert len(caps) == max(0, self.n_stations - 1), "buffer_caps length must be n_stations-1"
            self.buffer_caps = [int(c) for c in caps]
        self.proc_means = [float(m) for m in proc_means]
        assert len(self.proc_means) == self.n_stations, "proc_means length must equal n_stations"
        if isinstance(proc_dists, str):
            self.proc_dists = [proc_dists] * self.n_stations
        else:
            self.proc_dists = list(proc_dists)
            assert len(self.proc_dists) == self.n_stations, "proc_dists length must equal n_stations"
        self.util_alpha = float(util_alpha)

        # Action mapping
        self.speed_levels = np.array([0.8, 1.0, 1.2], dtype=np.float32)
        self.action_space = spaces.Discrete(len(self.speed_levels))

        # Observation: len(buffers) + n_stations
        obs_len = len(self.buffer_caps) + self.n_stations
        self.observation_space = spaces.Box(low=0.0, high=1.0, shape=(obs_len,), dtype=np.float32)

        self._rng = np.random.default_rng(seed)
        self._last_action: int = 1
        self._last_reward: float = 0.0
        self._last_obs: Optional[np.ndarray] = None

        # Core simulator
        self.sim = FactorySim(
            n_stations=self.n_stations,
            buffer_caps=self.buffer_caps,
            proc_means=self.proc_means,
            proc_dists=self.proc_dists,
            util_alpha=self.util_alpha,
        )

        # Initialize
        self.sim.reset(seed=seed)

    # ------------- Gym API -------------
    def reset(self, *, seed: Optional[int] = None, options: Optional[Dict[str, Any]] = None):
        super().reset(seed=seed)
        self._last_action = 1
        self._last_reward = 0.0
        self.sim.reset(seed=seed)
        info = self.sim.get_snapshot()
        obs = self._observe(info)
        self._last_obs = obs
        return obs, self._info_dict(info)

    def step(self, action: int):
        action = int(action)
        action = max(0, min(action, len(self.speed_levels) - 1))
        self._last_action = action
        speed = float(self.speed_levels[action])
        # Apply control and advance to next decision event
        self.sim.apply_action(speed_mult=speed)
        info = self.sim.run_until_next_decision()
        reward = self._reward(info)
        obs = self._observe(info)

        self._last_obs = obs
        self._last_reward = float(reward)

        terminated = False
        truncated = False
        return obs, float(reward), terminated, truncated, self._info_dict(info)

    # ------------- API used by FastAPI layer -------------
    def get_state(self) -> Dict[str, Any]:
        info = self.sim.get_snapshot()  # safe read-only snapshot
        result = self._info_dict(info)
        result["obs"] = self._observe(info).tolist()
        return result

    # ------------- Helpers -------------
    def _observe(self, info: Dict[str, Any]) -> np.ndarray:
        # Buffers normalized by capacity, stations by util_ema
        buf_names = [f"b{i+1}{i+2}" for i in range(max(0, self.n_stations - 1))]
        buffers = info.get("buffers", {})
        buf_vals = [float(buffers.get(name, 0)) for name in buf_names]
        buf_norm = [
            (buf_vals[i] / float(self.buffer_caps[i])) if i < len(self.buffer_caps) and self.buffer_caps[i] > 0 else 0.0
            for i in range(len(buf_vals))
        ]

        stations = info.get("stations", [])
        util = [float(s.get("util_ema", 0.0)) for s in stations]

        obs = np.array([*buf_norm, *util], dtype=np.float32)
        return obs

    def _reward(self, info: Dict[str, Any]) -> float:
        # Delegate to DES kernel for reward computation for consistency
        return float(self.sim.compute_reward(info))

    def _info_dict(self, info: Dict[str, Any]) -> Dict[str, Any]:
        # Copy-through and add reward/action for API compatibility
        base = {
            "t": int(float(info.get("t", 0))),
            "t_start": float(info.get("t_start", float(info.get("t", 0)))),
            "t_end": float(info.get("t_end", float(info.get("t", 0)))),
            "event": info.get("event", None),
            "buffers": info.get("buffers", {}),
            "stations": info.get("stations", []),
            "throughput": int(info.get("throughput", 0)),
            "wip": int(info.get("wip", 0)),
            "blocked": int(info.get("blocked", 0)),
            "starved": int(info.get("starved", 0)),
        }
        base["reward"] = float(self._last_reward)
        base["action"] = int(self._last_action)
        return base
