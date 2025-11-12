from typing import Any, Dict, Optional, Tuple

import gymnasium as gym
import numpy as np
from gymnasium import spaces


class MiniFactoryEnv(gym.Env):
    """
    MVP discrete-time, 3-station line with 2 buffers and discrete actions.

    - Action space: Discrete(3) -> speed multipliers [0.8, 1.0, 1.2]
    - Observation: [b12_norm, b23_norm, u1_ema, u2_ema, u3_ema]
    - Reward: throughput - 0.05*WIP - 0.1*(blocked + starved)

    No failures in MVP; hooks can be added later.
    """

    metadata = {"render_modes": []}

    def __init__(
        self,
        *,
        buffer_capacities: Tuple[int, int] = (5, 5),
        proc_uniform_seconds: Tuple[float, float] = (4.0, 6.0),
        ema_alpha: float = 0.1,
        tick_seconds: float = 1.0,
        seed: Optional[int] = None,
    ) -> None:
        super().__init__()
        self.buffer_caps = buffer_capacities
        self.proc_uniform = proc_uniform_seconds
        self.ema_alpha = ema_alpha
        self.dt = float(tick_seconds)

        # Discrete speed levels
        self.speed_levels = np.array([0.8, 1.0, 1.2], dtype=np.float32)

        # Gymnasium spaces
        self.action_space = spaces.Discrete(3)
        self.observation_space = spaces.Box(
            low=0.0, high=1.0, shape=(5,), dtype=np.float32
        )

        self._rng = np.random.default_rng(seed)
        self._t = 0

        # Buffers b12, b23
        self._buffers = [0, 0]

        # Station state
        # status: 0=idle, 1=working, 2=blocked (no failures yet)
        self._status = [0, 0, 0]
        self._remaining = [0.0, 0.0, 0.0]
        self._util_ema = [0.0, 0.0, 0.0]
        self._starved_flags = [False, False, False]
        self._blocked_flags = [False, False, False]

        self._last_throughput = 0
        self._last_reward = 0.0
        self._last_action = 1  # nominal

    # ----- Core dynamics -----
    def _sample_proc_time(self, speed: float) -> float:
        low, high = self.proc_uniform
        base = float(self._rng.uniform(low, high))
        # Faster speed reduces processing time
        return max(0.1, base / float(speed))

    def _attempt_transfer(self, station: int) -> bool:
        """Try to send a finished part to next buffer or out; return success."""
        if station == 2:
            # Last station: part leaves system
            self._last_throughput += 1
            return True
        buf_idx = station  # 0 for S1->S2 (b12), 1 for S2->S3 (b23)
        if self._buffers[buf_idx] < self.buffer_caps[buf_idx]:
            self._buffers[buf_idx] += 1
            return True
        return False

    def _can_pull(self, station: int) -> bool:
        if station == 0:
            # Infinite raw supply for S1
            return True
        prev_buf = station - 1
        return self._buffers[prev_buf] > 0

    def _pull(self, station: int) -> None:
        if station > 0:
            self._buffers[station - 1] -= 1
        self._status[station] = 1

    def reset(self, *, seed: Optional[int] = None, options: Optional[Dict[str, Any]] = None):
        super().reset(seed=seed)
        if seed is not None:
            self._rng = np.random.default_rng(seed)
        self._t = 0
        self._buffers = [0, 0]
        self._status = [0, 0, 0]
        self._remaining = [0.0, 0.0, 0.0]
        self._util_ema = [0.0, 0.0, 0.0]
        self._starved_flags = [False, False, False]
        self._blocked_flags = [False, False, False]
        self._last_throughput = 0
        self._last_reward = 0.0
        self._last_action = 1

        obs = self._observe()
        info = self._info()
        return obs, info

    def step(self, action: int):
        action = int(action)
        self._last_action = action
        speed = float(self.speed_levels[action])
        self._t += 1
        self._last_throughput = 0

        # Phase 1: advance work and complete if time elapsed
        for s in range(3):
            if self._status[s] == 1:
                self._remaining[s] -= self.dt
                if self._remaining[s] <= 0.0:
                    # Finished; try to transfer this tick
                    if self._attempt_transfer(s):
                        # Freed
                        self._status[s] = 0
                        self._blocked_flags[s] = False
                    else:
                        # Blocked with finished part
                        self._status[s] = 2
                        self._blocked_flags[s] = True

        # Phase 2: try to clear any blocked transfers
        for s in range(3):
            if self._status[s] == 2:
                if self._attempt_transfer(s):
                    self._status[s] = 0
                    self._blocked_flags[s] = False

        # Phase 3: start new work where possible
        for s in range(3):
            if self._status[s] == 0:  # idle
                if self._can_pull(s):
                    self._pull(s)
                    self._remaining[s] = self._sample_proc_time(speed)
                    self._starved_flags[s] = False
                else:
                    # Starved: no input available
                    self._starved_flags[s] = True

        # Update utilization EMA
        for s in range(3):
            busy = 1.0 if self._status[s] == 1 else 0.0
            self._util_ema[s] = (1.0 - self.ema_alpha) * self._util_ema[s] + self.ema_alpha * busy

        # Reward components
        wip = self._buffers[0] + self._buffers[1]
        for s in range(3):
            if self._status[s] in (1, 2):
                wip += 1
        blocked = sum(1 for b in self._blocked_flags if b)
        starved = sum(1 for st in self._starved_flags if st)

        reward = float(self._last_throughput) - 0.05 * float(wip) - 0.1 * float(blocked + starved)
        self._last_reward = reward

        obs = self._observe()
        info = self._info()
        terminated = False
        truncated = False
        return obs, reward, terminated, truncated, info

    # ----- Helpers -----
    def _observe(self) -> np.ndarray:
        b12_norm = 0.0 if self.buffer_caps[0] == 0 else self._buffers[0] / float(self.buffer_caps[0])
        b23_norm = 0.0 if self.buffer_caps[1] == 0 else self._buffers[1] / float(self.buffer_caps[1])
        obs = np.array(
            [
                b12_norm,
                b23_norm,
                self._util_ema[0],
                self._util_ema[1],
                self._util_ema[2],
            ],
            dtype=np.float32,
        )
        return obs

    def _info(self) -> Dict[str, Any]:
        return {
            "t": self._t,
            "buffers": {"b12": self._buffers[0], "b23": self._buffers[1]},
            "stations": [
                {
                    "status": int(self._status[i]),
                    "remaining": float(self._remaining[i]),
                    "util_ema": float(self._util_ema[i]),
                    "starved": bool(self._starved_flags[i]),
                    "blocked": bool(self._blocked_flags[i]),
                }
                for i in range(3)
            ],
            "throughput": int(self._last_throughput),
            "reward": float(self._last_reward),
            "action": int(self._last_action),
        }

    def get_state(self) -> Dict[str, Any]:
        return self._info() | {"obs": self._observe().tolist()}
