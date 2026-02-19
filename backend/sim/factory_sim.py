from __future__ import annotations

import os
from typing import Type

from backend.sim.factory_sim_py import FactorySim as PythonFactorySim

FactorySim: Type[object]

_backend = os.getenv("MFT_SIM_BACKEND", "auto").strip().lower()

if _backend == "python":
    FactorySim = PythonFactorySim
else:
    try:
        from backend.sim.rust_bridge import RustFactorySim

        FactorySim = RustFactorySim
    except Exception:
        if _backend == "rust":
            raise RuntimeError(
                "MFT_SIM_BACKEND=rust but Rust simulator is unavailable. "
                "Build/install the Rust Python extension first."
            )
        FactorySim = PythonFactorySim

