from __future__ import annotations

import argparse
import os
from typing import Optional

from backend.rl.factory_env import MiniFactoryEnv


def run_random_rollouts(episodes: int, n_jobs: int, seed: Optional[int]) -> None:
    env = MiniFactoryEnv(seed=seed)
    for ep in range(episodes):
        obs, info = env.reset(seed=seed, options={"n_jobs": n_jobs})
        done = False
        total_reward = 0.0
        steps = 0
        while not done:
            action = env.action_space.sample()
            obs, reward, terminated, truncated, info = env.step(action)
            total_reward += reward
            steps += 1
            done = terminated or truncated
        print(
            f"[random] episode={ep + 1} steps={steps} "
            f"reward={total_reward:.3f} jobs={info.get('throughput', 0)}"
        )


def run_ppo(total_timesteps: int, n_jobs: int, seed: Optional[int]) -> None:
    try:
        from stable_baselines3 import PPO
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "stable-baselines3 is not installed. "
            "Install it with: pip install stable-baselines3"
        ) from exc

    env = MiniFactoryEnv(seed=seed)
    env.reset(seed=seed, options={"n_jobs": n_jobs})
    model = PPO("MlpPolicy", env, verbose=1, seed=seed)
    model.learn(total_timesteps=total_timesteps)
    print(f"[ppo] training complete timesteps={total_timesteps}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Python RL training entrypoint for Mini Factory Twin."
    )
    parser.add_argument("--backend", choices=["auto", "rust", "python"], default="auto")
    parser.add_argument("--mode", choices=["random", "ppo"], default="random")
    parser.add_argument("--episodes", type=int, default=3)
    parser.add_argument("--timesteps", type=int, default=5000)
    parser.add_argument("--n-jobs", type=int, default=100)
    parser.add_argument("--seed", type=int, default=None)
    args = parser.parse_args()

    os.environ["MFT_SIM_BACKEND"] = args.backend

    if args.mode == "ppo":
        run_ppo(total_timesteps=args.timesteps, n_jobs=args.n_jobs, seed=args.seed)
    else:
        run_random_rollouts(episodes=args.episodes, n_jobs=args.n_jobs, seed=args.seed)


if __name__ == "__main__":
    main()

