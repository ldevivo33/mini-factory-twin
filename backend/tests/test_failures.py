from backend.sim.factory_sim import FactorySim


def test_station_one_can_fail_and_enter_down_state():
    """Regression test to ensure Station 1 can fail and report down state."""
    sim = FactorySim(fail_rate=1.0, repair_time=5.0, workers=1)
    sim.reset(seed=123, n_jobs=5)

    seen_failure = False
    # With fail_rate = 1.0 the very next decision should be a failure for some station.
    # Iterate a few events to specifically catch Station 1.
    for _ in range(50):
        snap = sim.run_until_next_decision()
        event = snap.get("event") or {}
        if event.get("type") == sim.EVT_MACHINE_FAILURE and event.get("station") == 0:
            station_zero = snap["stations"][0]
            assert station_zero["down"] is True
            assert station_zero["repairing"] in (True, False)
            seen_failure = True
            break

    assert seen_failure, "Station S1 never reported a failure."
