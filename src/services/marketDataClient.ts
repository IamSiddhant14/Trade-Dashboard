import {
  type SymbolCode,
} from '../types/marketData'
import { marketDataStore } from './marketDataStore'
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from './marketDataWorkerProtocol'

const DEFAULT_WS_URL = 'ws://localhost:8080'
const DEFAULT_DEV_RUNTIME_URLS = ['/api/intervals']

export type RuntimeLoadPreset = 'normal' | 'stress'

const runtimeIntervalPresets = {
  normal: {
    all_trades: { min: 250, max: 500 },
    l2_orderbook: { min: 500, max: 1000 },
    'v2/ticker': { min: 500, max: 1000 },
  },
  stress: {
    all_trades: { min: 1, max: 5 },
    l2_orderbook: { min: 10, max: 20 },
    'v2/ticker': { min: 300, max: 700 },
  },
} satisfies Record<
  RuntimeLoadPreset,
  Record<string, { min: number; max: number }>
>

const toIntervalsUrl = (url: string) => {
  const trimmed = url.replace(/\/$/, '')
  return trimmed.endsWith('/intervals') ? trimmed : `${trimmed}/intervals`
}

const toHttpUrlFromWsUrl = (url: string | undefined) => {
  if (!url) return null
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol === 'ws:') {
      parsedUrl.protocol = 'http:'
    } else if (parsedUrl.protocol === 'wss:') {
      parsedUrl.protocol = 'https:'
    } else {
      return null
    }
    parsedUrl.pathname = ''
    parsedUrl.search = ''
    parsedUrl.hash = ''
    return parsedUrl.toString()
  } catch {
    return null
  }
}

class MarketDataClient {
  private worker: Worker | null = null
  private started = false

  private get wsUrl() {
    return import.meta.env.VITE_MARKET_WS_URL ?? DEFAULT_WS_URL
  }

  private get runtimeUrls() {
    const configuredUrl = import.meta.env.VITE_MARKET_HTTP_URL
    if (configuredUrl) return [configuredUrl]

    const derivedUrl = toHttpUrlFromWsUrl(import.meta.env.VITE_MARKET_WS_URL)
    if (derivedUrl) return [derivedUrl]

    return import.meta.env.DEV ? DEFAULT_DEV_RUNTIME_URLS : []
  }

  start() {
    if (this.started) return
    this.started = true
    this.postToWorker({
      type: 'start',
      wsUrl: this.wsUrl,
      focusedSymbol: marketDataStore.getFocusedSymbol(),
      grouping: marketDataStore.getGrouping(),
    })
  }

  setFocusedSymbol(symbol: SymbolCode) {
    if (marketDataStore.getFocusedSymbol() === symbol) return
    marketDataStore.setFocusedSymbol(symbol)
    this.postToWorker({ type: 'setFocusedSymbol', symbol })
  }

  setGrouping(grouping: number) {
    marketDataStore.setGrouping(grouping)
    this.postToWorker({ type: 'setGrouping', grouping })
  }

  async applyRuntimePreset(preset: RuntimeLoadPreset) {
    const payload = runtimeIntervalPresets[preset]
    const runtimeUrls = this.runtimeUrls
    let lastError: unknown

    if (runtimeUrls.length === 0) {
      throw new Error(
        'Runtime load controls require VITE_MARKET_HTTP_URL or VITE_MARKET_WS_URL in production',
      )
    }

    for (const url of runtimeUrls) {
      try {
        const response = await fetch(toIntervalsUrl(url), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        await response.json()
        return
      } catch (error) {
        lastError = error
      }
    }

    throw new Error(
      `Unable to update backend intervals: ${
        lastError instanceof Error ? lastError.message : 'request failed'
      }`,
    )
  }

  private postToWorker(message: MainToWorkerMessage) {
    if (!this.started) return
    this.getWorker().postMessage(message)
  }

  private getWorker() {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('./marketData.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.addEventListener('message', (event: MessageEvent<WorkerToMainMessage>) => {
      marketDataStore.applyWorkerMessage(event.data)
    })
    worker.addEventListener('error', () => {
      marketDataStore.setConnectionStatus('reconnecting', 'Worker error')
    })
    this.worker = worker
    return worker
  }
}

export const marketDataClient = new MarketDataClient()
