import axios from 'axios'

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL,
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' }
})

export const getState = async () => {
  const { data } = await api.get('/state')
  return data
}

export const postReset = async (seed = null) => {
  const { data } = await api.post('/reset', seed !== null ? { seed } : {})
  return data
}

export const postStep = async (action = 1, session_id = 'default') => {
  const { data } = await api.post('/step', { action, session_id })
  return data
}

