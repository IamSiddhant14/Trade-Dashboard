import {
  SUPPORTED_SYMBOLS,
  SYMBOL_META,
  type ConnectionStatus,
  type FocusSnapshot,
  type OrderBookMetrics,
  type OrderBookSnapshot,
  type StatusSnapshot,
  type SymbolCode,
  type TickerView,
  type TradesSnapshot,
  type TradeStats,
} from '../types/marketData'
import type { WorkerToMainMessage } from './marketDataWorkerProtocol'

const FOCUSED_SYMBOL_KEY = 'delta.focusedSymbol'

type Listener = () => void

class StoreSlice<T> {
  private listeners = new Set<Listener>()
  private scheduled = false
  private snapshot: T

  constructor(snapshot: T) {
    this.snapshot = snapshot
  }

  getSnapshot = () => this.snapshot

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setSnapshot(snapshot: T, notify = true) {
    if (Object.is(this.snapshot, snapshot)) return
    this.snapshot = snapshot
    if (notify) this.scheduleNotify()
  }

  notifyNow() {
    this.scheduled = false
    for (const listener of this.listeners) listener()
  }

  private scheduleNotify() {
    if (this.scheduled) return
    this.scheduled = true
    requestAnimationFrame(() => this.notifyNow())
  }
}

const emptyBookMetrics: OrderBookMetrics = {
  midPriceLabel: '--',
  spreadLabel: '--',
  spreadBpsLabel: '--',
  imbalanceLabel: '--',
}

const emptyTradeStats: TradeStats = {
  buyVolume: 0,
  sellVolume: 0,
  tradeCount: 0,
  averageTradeSize: 0,
}

const createOrderBookSnapshot = (
  symbol: SymbolCode,
  status: OrderBookSnapshot['status'],
  grouping = SYMBOL_META[symbol].defaultGrouping,
): OrderBookSnapshot => ({
  symbol,
  status,
  grouping,
  groupingOptions: SYMBOL_META[symbol].groupingIncrements,
  asks: [],
  bids: [],
  metrics: emptyBookMetrics,
})

const createTradesSnapshot = (
  symbol: SymbolCode,
  status: TradesSnapshot['status'],
): TradesSnapshot => ({
  symbol,
  status,
  rows: [],
  stats: emptyTradeStats,
})

const getSavedFocusedSymbol = (): SymbolCode => {
  const saved = window.localStorage.getItem(FOCUSED_SYMBOL_KEY)
  return SUPPORTED_SYMBOLS.includes(saved as SymbolCode)
    ? (saved as SymbolCode)
    : 'BTCUSD'
}

const createStatusSnapshot = (): StatusSnapshot => ({
  connectionStatus: 'disconnected',
  lastError: null,
})

const createTickerSlices = () =>
  Object.fromEntries(
    SUPPORTED_SYMBOLS.map((symbol) => [
      symbol,
      new StoreSlice<TickerView | null>(null),
    ]),
  ) as Record<SymbolCode, StoreSlice<TickerView | null>>

class MarketDataStore {
  private readonly focusedSymbolSlice: StoreSlice<FocusSnapshot>
  private readonly orderBookSlice: StoreSlice<OrderBookSnapshot>
  private readonly tradesSlice: StoreSlice<TradesSnapshot>
  private readonly statusSlice: StoreSlice<StatusSnapshot>
  private readonly tickerSlices: Record<SymbolCode, StoreSlice<TickerView | null>>

  private focusedSymbol: SymbolCode
  private grouping: number
  private status: StatusSnapshot

  constructor() {
    this.focusedSymbol = getSavedFocusedSymbol()
    this.grouping = SYMBOL_META[this.focusedSymbol].defaultGrouping
    this.status = createStatusSnapshot()

    this.focusedSymbolSlice = new StoreSlice({ symbol: this.focusedSymbol })
    this.orderBookSlice = new StoreSlice(
      createOrderBookSnapshot(this.focusedSymbol, 'loading', this.grouping),
    )
    this.tradesSlice = new StoreSlice(
      createTradesSnapshot(this.focusedSymbol, 'loading'),
    )
    this.statusSlice = new StoreSlice(this.status)
    this.tickerSlices = createTickerSlices()
  }

  getFocusedSymbol = () => this.focusedSymbol

  getGrouping = () => this.grouping

  getFocusedSymbolSnapshot = () => this.focusedSymbolSlice.getSnapshot()

  subscribeFocusedSymbol = (listener: Listener) =>
    this.focusedSymbolSlice.subscribe(listener)

  getTickerSnapshot = (symbol: SymbolCode) =>
    this.tickerSlices[symbol].getSnapshot()

  subscribeTicker = (symbol: SymbolCode, listener: Listener) =>
    this.tickerSlices[symbol].subscribe(listener)

  getOrderBookSnapshot = () => this.orderBookSlice.getSnapshot()

  subscribeOrderBook = (listener: Listener) =>
    this.orderBookSlice.subscribe(listener)

  getTradesSnapshot = () => this.tradesSlice.getSnapshot()

  subscribeTrades = (listener: Listener) => this.tradesSlice.subscribe(listener)

  getStatusSnapshot = () => this.statusSlice.getSnapshot()

  subscribeStatus = (listener: Listener) => this.statusSlice.subscribe(listener)

  applyWorkerMessage(message: WorkerToMainMessage) {
    switch (message.type) {
      case 'status':
        this.updateStatus(message.patch)
        break
      case 'focus':
        if (this.focusedSymbol !== message.symbol) {
          this.setFocusedSymbol(message.symbol)
        } else {
          this.focusedSymbolSlice.setSnapshot({ symbol: message.symbol })
        }
        break
      case 'ticker':
        this.tickerSlices[message.symbol].setSnapshot(message.snapshot)
        break
      case 'orderbook':
        this.focusedSymbol = message.snapshot.symbol
        this.grouping = message.snapshot.grouping
        this.orderBookSlice.setSnapshot(message.snapshot)
        break
      case 'trades':
        this.focusedSymbol = message.snapshot.symbol
        this.tradesSlice.setSnapshot(message.snapshot)
        break
    }
  }

  setFocusedSymbol(symbol: SymbolCode) {
    if (this.focusedSymbol === symbol) return
    this.focusedSymbol = symbol
    this.grouping = SYMBOL_META[symbol].defaultGrouping
    window.localStorage.setItem(FOCUSED_SYMBOL_KEY, symbol)
    this.focusedSymbolSlice.setSnapshot({ symbol })
    this.orderBookSlice.setSnapshot(createOrderBookSnapshot(symbol, 'loading', this.grouping))
    this.tradesSlice.setSnapshot(createTradesSnapshot(symbol, 'loading'))
  }

  setGrouping(grouping: number) {
    if (this.grouping === grouping) return
    this.grouping = grouping
    const current = this.orderBookSlice.getSnapshot()
    this.orderBookSlice.setSnapshot({
      ...current,
      grouping,
      groupingOptions: SYMBOL_META[this.focusedSymbol].groupingIncrements,
      status: current.status,
    })
  }

  setConnectionStatus(
    connectionStatus: ConnectionStatus,
    lastError: string | null,
  ) {
    this.updateStatus({ connectionStatus, lastError })
  }

  private updateStatus(patch: Partial<StatusSnapshot>) {
    this.status = {
      ...this.status,
      ...patch,
    }
    this.statusSlice.setSnapshot(this.status)
  }
}

export const marketDataStore = new MarketDataStore();
