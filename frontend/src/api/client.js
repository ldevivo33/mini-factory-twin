import axios from 'axios'

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL,
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' }
})

// DES endpoints
export const simReset = async (payload = {}) => {
  const { data } = await api.post('/sim/reset', payload)
  return data
}

export const simStep = async (speed_mult = 1.0) => {
  const { data } = await api.post('/sim/step', { speed_mult })
  return data
}

export const simState = async () => {
  const { data } = await api.get('/sim/state')
  return data
}

export const simRunToFinish = async () => {
  const { data } = await api.post('/sim/run_to_finish')
  return data
}

export const simSummary = async () => {
  const { data } = await api.get('/sim/summary')
  return data
}

// Experiments endpoints
export const getExperiments = async (skip = 0, limit = 20) => {
  const { data } = await api.get(`/experiments?skip=${skip}&limit=${limit}`)
  return data
}

export const deleteExperiment = async (id) => {
  const { data } = await api.delete(`/experiments/${id}`)
  return data
}

export const deleteStaleExperiments = async () => {
  const { data } = await api.delete('/experiments')
  return data
}
