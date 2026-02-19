import axios from 'axios'
import type {
  DeleteResponse,
  ExperimentListItem,
  ResetConfig,
  Snapshot,
  Summary,
} from '../types'

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL,
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' }
})

// DES endpoints
export const simReset = async (payload: Partial<ResetConfig> = {}): Promise<Snapshot> => {
  const { data } = await api.post<Snapshot>('/sim/reset', payload)
  return data
}

export const simStep = async (speedMult = 1.0): Promise<Snapshot> => {
  const { data } = await api.post<Snapshot>('/sim/step', { speed_mult: speedMult })
  return data
}

export const simState = async (): Promise<Snapshot> => {
  const { data } = await api.get<Snapshot>('/sim/state')
  return data
}

export const simRunToFinish = async (): Promise<Summary> => {
  const { data } = await api.post<Summary>('/sim/run_to_finish')
  return data
}

export const simSummary = async (): Promise<Summary> => {
  const { data } = await api.get<Summary>('/sim/summary')
  return data
}

// Experiments endpoints
export const getExperiments = async (skip = 0, limit = 20): Promise<ExperimentListItem[]> => {
  const { data } = await api.get<ExperimentListItem[]>(`/experiments?skip=${skip}&limit=${limit}`)
  return data
}

export const deleteExperiment = async (id: number): Promise<DeleteResponse> => {
  const { data } = await api.delete<DeleteResponse>(`/experiments/${id}`)
  return data
}

export const deleteStaleExperiments = async (): Promise<DeleteResponse> => {
  const { data } = await api.delete<DeleteResponse>('/experiments')
  return data
}
