export type ProcDist = 'uniform' | 'exp' | string

export interface StationSnapshot {
  status: number
  remaining: number
  util_ema: number
  starved: boolean
  blocked: boolean
  down: boolean
  repairing: boolean
  repair_remaining: number
  state?: string
}

export interface SnapshotEvent {
  type: string | null
  station: number | null
}

export interface Snapshot {
  t: number
  t_start: number
  t_end: number
  event: SnapshotEvent | null
  buffers: Record<string, number>
  stations: StationSnapshot[]
  throughput: number
  wip: number
  blocked: number
  starved: number
  down: number
  workers_available: number
  workers_total: number
  avg_processing_time: number
  avg_processing_speed: number
}

export interface Summary {
  total_jobs: number
  jobs_completed: number
  makespan: number
  avg_wip: number
  avg_util: number
  throughput_rate: number
  down_stations: number
  workers_available: number
  workers_total: number
}

export interface ExperimentListItem {
  id: number
  seed: number | null
  n_jobs: number
  n_stations: number
  status: string
  created_at: string
  completed_at: string | null
  makespan: number | null
  throughput_rate: number | null
}

export interface ResetConfig {
  seed: number | null
  n_jobs: number
  n_stations: number
  buffer_caps: number[]
  proc_means: number[]
  proc_dists: ProcDist | ProcDist[]
  util_alpha: number
  fail_rate: number
  repair_time: number
  workers: number
}

export interface FailureEvent {
  time: number
  station: number | null
}

export interface DeleteResponse {
  message: string
}

