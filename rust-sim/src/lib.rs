use std::cmp::{Ordering, Reverse};
use std::collections::{BinaryHeap, VecDeque};

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyList};
use rand::prelude::*;
use rand::rngs::StdRng;
use rand_distr::{Distribution, Exp};

const STATUS_IDLE: u8 = 0;
const STATUS_WORKING: u8 = 1;
const STATUS_BLOCKED: u8 = 2;
const STATUS_DOWN: u8 = 3;

#[derive(Clone)]
struct Station {
    status: u8,
    starved: bool,
    end_time: Option<f64>,
    util_ema: f64,
    has_finished_part: bool,
    job_id: Option<usize>,
    repairing: bool,
    repair_eta: Option<f64>,
}

impl Station {
    fn new() -> Self {
        Self {
            status: STATUS_IDLE,
            starved: false,
            end_time: None,
            util_ema: 0.0,
            has_finished_part: false,
            job_id: None,
            repairing: false,
            repair_eta: None,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum EventType {
    ServiceComplete,
    MachineFailure,
    RepairComplete,
}

impl EventType {
    fn as_str(self) -> &'static str {
        match self {
            EventType::ServiceComplete => "service_complete",
            EventType::MachineFailure => "machine_failure",
            EventType::RepairComplete => "repair_complete",
        }
    }
}

#[derive(Clone, Copy)]
struct Event {
    t: f64,
    seq: u64,
    etype: EventType,
    sid: usize,
}

impl PartialEq for Event {
    fn eq(&self, other: &Self) -> bool {
        self.t.total_cmp(&other.t) == Ordering::Equal && self.seq == other.seq
    }
}

impl Eq for Event {}

impl Ord for Event {
    fn cmp(&self, other: &Self) -> Ordering {
        match self.t.total_cmp(&other.t) {
            Ordering::Equal => self.seq.cmp(&other.seq),
            o => o,
        }
    }
}

impl PartialOrd for Event {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[pyclass]
struct FactorySim {
    n_stations: usize,
    buffer_caps: Vec<usize>,
    proc_means: Vec<f64>,
    proc_dists: Vec<String>,
    util_alpha: f64,
    fail_rate: f64,
    repair_time: f64,
    workers_total: usize,
    workers_available: usize,
    repair_queue: VecDeque<usize>,
    rng: StdRng,
    time: f64,
    event_queue: BinaryHeap<Reverse<Event>>,
    seq: u64,
    current_speed: f64,
    #[pyo3(get)]
    jobs_total: usize,
    #[pyo3(get)]
    jobs_completed: usize,
    job_queue: VecDeque<usize>,
    wip_history: Vec<usize>,
    record_history: bool,
    buffers: Vec<usize>,
    stations: Vec<Station>,
    throughput_total: usize,
    throughput_since_decision: usize,
    t_last_decision: f64,
    last_event_type: Option<EventType>,
    last_event_sid: Option<usize>,
}

#[pymethods]
impl FactorySim {
    #[new]
    fn new(
        n_stations: usize,
        buffer_caps: Vec<usize>,
        proc_means: Vec<f64>,
        proc_dists: Vec<String>,
        util_alpha: f64,
        fail_rate: f64,
        repair_time: f64,
        workers: usize,
    ) -> PyResult<Self> {
        if n_stations < 1 {
            return Err(PyValueError::new_err("Need at least one station"));
        }
        if buffer_caps.len() != n_stations.saturating_sub(1) {
            return Err(PyValueError::new_err(
                "buffer_caps length must be n_stations-1",
            ));
        }
        if proc_means.len() != n_stations {
            return Err(PyValueError::new_err(
                "proc_means length must equal n_stations",
            ));
        }
        if proc_dists.len() != n_stations {
            return Err(PyValueError::new_err(
                "proc_dists length must equal n_stations",
            ));
        }

        Ok(Self {
            n_stations,
            buffer_caps,
            proc_means,
            proc_dists,
            util_alpha,
            fail_rate,
            repair_time,
            workers_total: workers,
            workers_available: workers,
            repair_queue: VecDeque::new(),
            rng: StdRng::from_entropy(),
            time: 0.0,
            event_queue: BinaryHeap::new(),
            seq: 0,
            current_speed: 1.0,
            jobs_total: 0,
            jobs_completed: 0,
            job_queue: VecDeque::new(),
            wip_history: Vec::new(),
            record_history: true,
            buffers: vec![0; n_stations.saturating_sub(1)],
            stations: (0..n_stations).map(|_| Station::new()).collect(),
            throughput_total: 0,
            throughput_since_decision: 0,
            t_last_decision: 0.0,
            last_event_type: None,
            last_event_sid: None,
        })
    }

    #[pyo3(signature = (seed=None, n_jobs=100))]
    fn reset(&mut self, py: Python, seed: Option<u64>, n_jobs: usize) -> PyResult<PyObject> {
        self.rng = match seed {
            Some(v) => StdRng::seed_from_u64(v),
            None => StdRng::from_entropy(),
        };
        self.time = 0.0;
        self.event_queue.clear();
        self.seq = 0;
        self.current_speed = 1.0;
        self.throughput_total = 0;
        self.throughput_since_decision = 0;
        self.workers_available = self.workers_total;
        self.repair_queue.clear();
        self.buffers = vec![0; self.n_stations.saturating_sub(1)];
        self.stations = (0..self.n_stations).map(|_| Station::new()).collect();
        self.jobs_total = n_jobs;
        self.jobs_completed = 0;
        self.job_queue = (0..n_jobs).collect();
        self.wip_history.clear();
        self.t_last_decision = 0.0;
        self.last_event_type = None;
        self.last_event_sid = None;

        self.apply_action(None);
        self.get_snapshot(py)
    }

    #[pyo3(signature = (speed_mult=None))]
    fn apply_action(&mut self, speed_mult: Option<f64>) {
        if let Some(v) = speed_mult {
            self.current_speed = v;
        }

        loop {
            let mut progress = false;

            for i in 0..self.n_stations {
                if self.stations[i].status == STATUS_BLOCKED && self.stations[i].has_finished_part {
                    if i == self.n_stations - 1 {
                        self.stations[i].status = STATUS_IDLE;
                        self.stations[i].has_finished_part = false;
                        self.throughput_total += 1;
                        self.throughput_since_decision += 1;
                        progress = true;
                    } else if self.buffers[i] < self.buffer_caps[i] {
                        self.buffers[i] += 1;
                        self.stations[i].status = STATUS_IDLE;
                        self.stations[i].has_finished_part = false;
                        progress = true;
                    }
                }
            }

            for i in 0..self.n_stations {
                if self.stations[i].status != STATUS_IDLE {
                    continue;
                }

                let can_pull = if i == 0 {
                    !self.job_queue.is_empty()
                } else {
                    self.buffers[i - 1] > 0
                };

                if !can_pull {
                    self.stations[i].starved = true;
                    continue;
                }

                let job_id = if i == 0 {
                    self.job_queue.pop_front()
                } else {
                    self.buffers[i - 1] -= 1;
                    None
                };

                let dur = self.sample_proc_time(i, self.current_speed);
                {
                    let st = &mut self.stations[i];
                    st.job_id = job_id;
                    st.starved = false;
                    st.status = STATUS_WORKING;
                    st.end_time = Some(self.time + dur);
                }
                self.schedule(self.time + dur, EventType::ServiceComplete, i);
                if self.rng.gen::<f64>() < self.fail_rate {
                    let fail_t = self.time + self.rng.gen_range(0.0..dur);
                    self.schedule(fail_t, EventType::MachineFailure, i);
                }
                progress = true;
            }

            if !progress {
                break;
            }
        }
    }

    fn run_until_next_decision(&mut self, py: Python) -> PyResult<PyObject> {
        self.throughput_since_decision = 0;
        while let Some(Reverse(evt)) = self.event_queue.pop() {
            self.advance_time(evt.t);
            let handled = match evt.etype {
                EventType::ServiceComplete => self.handle_service_complete(evt.sid),
                EventType::MachineFailure => self.handle_machine_failure(evt.sid),
                EventType::RepairComplete => self.handle_repair_complete(evt.sid),
            };

            if handled {
                self.last_event_type = Some(evt.etype);
                self.last_event_sid = Some(evt.sid);
                self.apply_action(None);
                break;
            }
        }

        let snap = self.get_snapshot(py)?;
        self.t_last_decision = self.time;
        Ok(snap)
    }

    fn get_snapshot(&self, py: Python) -> PyResult<PyObject> {
        let out = PyDict::new(py);
        let buffers = PyDict::new(py);
        let mut working = 0usize;
        let mut blocked = 0usize;
        let mut starved = 0usize;
        let mut down = 0usize;
        let mut wip = 0usize;

        for (i, level) in self.buffers.iter().enumerate() {
            buffers.set_item(format!("b{}{}", i + 1, i + 2), *level)?;
        }

        let stations = PyList::empty(py);
        for st in &self.stations {
            let st_obj = PyDict::new(py);
            let remaining = if st.status == STATUS_WORKING {
                (st.end_time.unwrap_or(self.time) - self.time).max(0.0)
            } else {
                0.0
            };
            let repair_remaining = if st.status == STATUS_DOWN {
                (st.repair_eta.unwrap_or(self.time) - self.time).max(0.0)
            } else {
                0.0
            };

            st_obj.set_item("status", st.status)?;
            st_obj.set_item("remaining", remaining)?;
            st_obj.set_item("util_ema", st.util_ema)?;
            st_obj.set_item("starved", st.starved)?;
            st_obj.set_item("blocked", st.status == STATUS_BLOCKED)?;
            st_obj.set_item("down", st.status == STATUS_DOWN)?;
            st_obj.set_item("repairing", st.repairing)?;
            st_obj.set_item("repair_remaining", repair_remaining)?;
            stations.append(st_obj)?;

            if st.status == STATUS_WORKING {
                working += 1;
            }
            if st.status == STATUS_BLOCKED {
                blocked += 1;
            }
            if st.starved {
                starved += 1;
            }
            if st.status == STATUS_DOWN {
                down += 1;
            }
        }

        wip += self.buffers.iter().sum::<usize>() + working + blocked;
        let avg_proc_time = if self.proc_means.is_empty() {
            0.0
        } else {
            self.proc_means.iter().sum::<f64>() / self.proc_means.len() as f64
        };
        let avg_proc_speed = if avg_proc_time > 0.0 {
            1.0 / avg_proc_time
        } else {
            0.0
        };

        let event = PyDict::new(py);
        event.set_item(
            "type",
            self.last_event_type.map(|e| e.as_str().to_string()),
        )?;
        event.set_item("station", self.last_event_sid)?;

        out.set_item("t", self.time)?;
        out.set_item("t_start", self.t_last_decision)?;
        out.set_item("t_end", self.time)?;
        out.set_item("event", event)?;
        out.set_item("buffers", buffers)?;
        out.set_item("stations", stations)?;
        out.set_item("throughput", self.throughput_since_decision)?;
        out.set_item("wip", wip)?;
        out.set_item("blocked", blocked)?;
        out.set_item("starved", starved)?;
        out.set_item("down", down)?;
        out.set_item("workers_available", self.workers_available)?;
        out.set_item("workers_total", self.workers_total)?;
        out.set_item("avg_processing_time", avg_proc_time)?;
        out.set_item("avg_processing_speed", avg_proc_speed)?;

        Ok(out.into())
    }

    fn run_to_finish(&mut self, py: Python) -> PyResult<PyObject> {
        while self.jobs_completed < self.jobs_total && !self.event_queue.is_empty() {
            let Reverse(evt) = self.event_queue.pop().unwrap();
            self.advance_time(evt.t);
            let handled = match evt.etype {
                EventType::ServiceComplete => self.handle_service_complete(evt.sid),
                EventType::MachineFailure => self.handle_machine_failure(evt.sid),
                EventType::RepairComplete => self.handle_repair_complete(evt.sid),
            };

            if handled {
                if self.record_history {
                    let wip = self.buffers.iter().sum::<usize>()
                        + self
                            .stations
                            .iter()
                            .filter(|s| s.status != STATUS_IDLE)
                            .count();
                    self.wip_history.push(wip);
                }
                self.apply_action(None);
            }
        }
        self.get_summary(py)
    }

    fn get_summary(&self, py: Python) -> PyResult<PyObject> {
        let total_time = self.time;
        let avg_wip = if self.wip_history.is_empty() {
            0.0
        } else {
            self.wip_history.iter().sum::<usize>() as f64 / self.wip_history.len() as f64
        };
        let avg_util = if self.stations.is_empty() {
            0.0
        } else {
            self.stations.iter().map(|s| s.util_ema).sum::<f64>() / self.stations.len() as f64
        };
        let throughput_rate = if total_time > 0.0 {
            self.jobs_completed as f64 / total_time
        } else {
            0.0
        };
        let down_stations = self
            .stations
            .iter()
            .filter(|s| s.status == STATUS_DOWN)
            .count();

        let out = PyDict::new(py);
        out.set_item("total_jobs", self.jobs_total)?;
        out.set_item("jobs_completed", self.jobs_completed)?;
        out.set_item("makespan", total_time)?;
        out.set_item("avg_wip", avg_wip)?;
        out.set_item("avg_util", avg_util)?;
        out.set_item("throughput_rate", throughput_rate)?;
        out.set_item("down_stations", down_stations)?;
        out.set_item("workers_available", self.workers_available)?;
        out.set_item("workers_total", self.workers_total)?;
        Ok(out.into())
    }
}

impl FactorySim {
    fn schedule(&mut self, t: f64, etype: EventType, sid: usize) {
        self.event_queue.push(Reverse(Event {
            t,
            seq: self.seq,
            etype,
            sid,
        }));
        self.seq += 1;
    }

    fn advance_time(&mut self, to_time: f64) {
        if to_time < self.time {
            return;
        }
        let dt = to_time - self.time;
        if dt > 0.0 {
            let decay = (1.0 - self.util_alpha).powf(dt);
            for st in &mut self.stations {
                let busy = if st.status == STATUS_WORKING { 1.0 } else { 0.0 };
                st.util_ema = st.util_ema * decay + (1.0 - decay) * busy;
            }
        }
        self.time = to_time;
    }

    fn sample_proc_time(&mut self, station_idx: usize, speed: f64) -> f64 {
        let mean = self.proc_means[station_idx];
        let dist = self.proc_dists[station_idx].as_str();
        let base = if dist == "exp" {
            let lambda = if mean <= 1e-9 { 1.0 } else { 1.0 / mean };
            Exp::new(lambda).unwrap().sample(&mut self.rng)
        } else {
            self.rng.gen_range(0.0..(2.0 * mean))
        };
        (base / speed.max(1e-6)).max(0.01)
    }

    fn handle_service_complete(&mut self, sid: usize) -> bool {
        if sid >= self.n_stations {
            return false;
        }

        let valid = {
            let st = &self.stations[sid];
            st.status == STATUS_WORKING
                && st.end_time.is_some()
                && (st.end_time.unwrap() - self.time).abs() <= 1e-9
        };
        if !valid {
            return false;
        }

        {
            let st = &mut self.stations[sid];
            st.status = STATUS_IDLE;
            st.end_time = Some(self.time);
            st.job_id = None;
        }

        if sid == self.n_stations - 1 {
            self.throughput_total += 1;
            self.throughput_since_decision += 1;
            self.stations[sid].has_finished_part = false;
            self.jobs_completed += 1;
        } else if self.buffers[sid] < self.buffer_caps[sid] {
            self.buffers[sid] += 1;
            self.stations[sid].has_finished_part = false;
        } else {
            self.stations[sid].status = STATUS_BLOCKED;
            self.stations[sid].has_finished_part = true;
        }
        true
    }

    fn handle_machine_failure(&mut self, sid: usize) -> bool {
        if sid >= self.n_stations {
            return false;
        }
        if self.stations[sid].status != STATUS_WORKING {
            return false;
        }

        if sid == 0 {
            if let Some(job_id) = self.stations[sid].job_id.take() {
                self.job_queue.push_front(job_id);
            }
        } else {
            self.buffers[sid - 1] += 1;
        }

        {
            let st = &mut self.stations[sid];
            st.status = STATUS_DOWN;
            st.starved = false;
            st.has_finished_part = false;
            st.end_time = None;
            st.repairing = false;
            st.repair_eta = None;
        }

        if self.workers_available > 0 {
            self.assign_repair_worker(sid);
        } else if !self.repair_queue.contains(&sid) {
            self.repair_queue.push_back(sid);
        }
        true
    }

    fn handle_repair_complete(&mut self, sid: usize) -> bool {
        if sid >= self.n_stations {
            return false;
        }
        if self.stations[sid].status != STATUS_DOWN {
            return false;
        }

        {
            let st = &mut self.stations[sid];
            st.status = STATUS_IDLE;
            st.starved = false;
            st.has_finished_part = false;
            st.end_time = None;
            st.repairing = false;
            st.repair_eta = None;
        }
        self.workers_available = (self.workers_available + 1).min(self.workers_total);
        if let Some(next_sid) = self.repair_queue.pop_front() {
            if !self.assign_repair_worker(next_sid) {
                self.repair_queue.push_front(next_sid);
            }
        }
        true
    }

    fn assign_repair_worker(&mut self, sid: usize) -> bool {
        if sid >= self.n_stations || self.workers_available == 0 {
            return false;
        }
        if self.stations[sid].status != STATUS_DOWN || self.stations[sid].repairing {
            return false;
        }
        self.stations[sid].repairing = true;
        self.stations[sid].repair_eta = Some(self.time + self.repair_time);
        self.workers_available -= 1;
        self.schedule(self.time + self.repair_time, EventType::RepairComplete, sid);
        true
    }
}

#[pymodule]
fn mft_rust_sim(_py: Python, m: &PyModule) -> PyResult<()> {
    m.add_class::<FactorySim>()?;
    Ok(())
}

