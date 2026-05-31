import type { OrderBookSnapshot, StatusSnapshot, TickerView, TradesSnapshot } from './marketDataStore'
import type { SymbolCode } from '../types/marketData'

export type MainToWorkerMessage =
  | {
      type: 'start'
      wsUrl: string
      focusedSymbol: SymbolCode
      grouping: number
    }
  | {
      type: 'setFocusedSymbol'
      symbol: SymbolCode
    }
  | {
      type: 'setGrouping'
      grouping: number
    }

export type WorkerToMainMessage =
  | {
      type: 'status'
      patch: Partial<StatusSnapshot>
    }
  | {
      type: 'focus'
      symbol: SymbolCode
    }
  | {
      type: 'ticker'
      symbol: SymbolCode
      snapshot: TickerView
    }
  | {
      type: 'orderbook'
      snapshot: OrderBookSnapshot
    }
  | {
      type: 'trades'
      snapshot: TradesSnapshot
    }
