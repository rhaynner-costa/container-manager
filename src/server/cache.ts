interface CacheEntry<T> {
  data: T
  expiresAt: number
}

export function makeCache<T>(ttlMs: number) {
  const store = new Map<string, CacheEntry<T>>()

  return {
    get(key: string): T | null {
      const entry = store.get(key)
      if (!entry || Date.now() > entry.expiresAt) {
        store.delete(key)
        return null
      }
      return entry.data
    },
    set(key: string, data: T): void {
      store.set(key, { data, expiresAt: Date.now() + ttlMs })
    },
    invalidate(key?: string): void {
      if (key !== undefined) store.delete(key)
      else store.clear()
    }
  }
}

// Garante no máximo uma execução em voo por chave. Chamadas concorrentes
// (múltiplas abas, polls sobrepostos) reaproveitam a mesma Promise em vez de
// disparar um novo processo `wsl`/`docker` cada uma — evita empilhar
// processos dentro do WSL2 quando um comando demora mais que o intervalo de poll.
export function makeInFlightGuard() {
  const inFlight = new Map<string, Promise<unknown>>()

  return function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(key)
    if (existing) return existing as Promise<T>

    const promise = fn().finally(() => inFlight.delete(key))
    inFlight.set(key, promise)
    return promise
  }
}
