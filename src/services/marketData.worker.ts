import {
  CHANNELS,
  SUPPORTED_SYMBOLS,
  SYMBOL_META,
  isSymbolCode,
  type BookLevelView,
  type MarketMessage,
  type OrderBookMetrics,
  type OrderBookSnapshot,
  type OrderbookMessage,
  type Side,
  type StatusSnapshot,
  type SubscribeChannel,
  type SymbolCode,
  type TickerMessage,
  type TickerView,
  type TradeMessage,
  type TradeRowView,
  type TradeStats,
  type TradesSnapshot,
} from '../types/marketData'
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from './marketDataWorkerProtocol'

const VISIBLE_BOOK_LEVELS = 10
const VISIBLE_TRADE_ROWS = 100
const MAX_TRADE_ROWS = 200
const MAX_PENDING_TRADES = 5000
const TRADE_AGGREGATION_WINDOW_MS = 100
const ROLLING_STATS_WINDOW_MS = 60_000
const FRAME_INTERVAL_MS = 16
const FLASH_THRESHOLD = 0.1

type FrameTimer = ReturnType<typeof setTimeout> | null

interface WorkerScope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<MainToWorkerMessage>) => void,
  ): void
  postMessage(message: WorkerToMainMessage): void
}

interface PendingBook {
  message: OrderbookMessage
}

interface GroupedLevel {
  price: number
  size: number
}

interface BookSideBuild {
  levels: BuiltBookLevel[]
  total: number
  maxCumulative: number
}

interface BuiltBookLevel extends BookLevelView {
  price: number
  size: number
  cumulative: number
}

interface RollingTradeSample {
  timeMs: number
  side: Side
  size: number
}

interface MutableTradeAggregate {
  id: string
  symbol: SymbolCode
  price: number
  size: number
  tradeCount: number
  buyVolume: number
  sellVolume: number
  windowStartMs: number
  timeMs: number
  side: Side
  view: TradeRowView
}

const workerScope = self as unknown as WorkerScope

const emptyBookMetrics: OrderBookMetrics = {
  midPriceLabel: '--',
  spreadLabel: '--',
  spreadBpsLabel: '--',
  imbalanceLabel: '--',
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
  stats: {
    buyVolume: 0,
    sellVolume: 0,
    tradeCount: 0,
    averageTradeSize: 0,
  },
})

const toMs = (timestampUs: number) => Math.floor(timestampUs / 1000)

const formatPrice = (symbol: SymbolCode, value: number) =>
  value.toLocaleString(undefined, {
    minimumFractionDigits: SYMBOL_META[symbol].precision,
    maximumFractionDigits: SYMBOL_META[symbol].precision,
  })

const formatSize = (value: number) =>
  value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })

const formatNotional = (value: number) =>
  value.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })

const formatTime = (timeMs: number) => {
  const date = new Date(timeMs)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  const ms = date.getMilliseconds().toString().padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${ms}`
}

const roundToPrecision = (symbol: SymbolCode, value: number) =>
  Number(value.toFixed(SYMBOL_META[symbol].precision))

const getGroupedPrice = (
  symbol: SymbolCode,
  side: 'ask' | 'bid',
  price: number,
  increment: number,
) => {
  const scaled = price / increment
  const grouped =
    side === 'bid'
      ? Math.floor(scaled + Number.EPSILON) * increment
      : Math.ceil(scaled - Number.EPSILON) * increment
  return roundToPrecision(symbol, grouped)
}

const inferTradeSide = (trade: TradeMessage): Side => {
  if (trade.buyer_role === 'taker') return 'buy'
  if (trade.seller_role === 'taker') return 'sell'
  return 'buy'
}

const toBookLevelView = (level: BuiltBookLevel): BookLevelView => ({
  key: level.key,
  side: level.side,
  priceLabel: level.priceLabel,
  sizeLabel: level.sizeLabel,
  cumulativeLabel: level.cumulativeLabel,
  depthPercent: level.depthPercent,
  flash: level.flash,
  flashId: level.flashId,
})

class MarketDataWorkerRuntime {
  private socket: WebSocket | null = null
  private wsUrl = ''
  private started = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private focusedSymbol: SymbolCode = 'BTCUSD'
  private grouping = SYMBOL_META.BTCUSD.defaultGrouping
  private pendingBook: PendingBook | null = null
  private latestOrderBook: OrderbookMessage | null = null
  private bookFrameTimer: FrameTimer = null
  private tradeFrameTimer: FrameTimer = null
  private pendingTrades: TradeMessage[] = []
  private tradeRows: MutableTradeAggregate[] = []
  private activeTradeRowsByPrice = new Map<string, MutableTradeAggregate>()
  private rollingSamples: RollingTradeSample[] = []
  private rollingSampleStart = 0
  private rollingBuyVolume = 0
  private rollingSellVolume = 0
  private rollingTradeCount = 0
  private rollingTotalSize = 0
  private previousBookSizes = new Map<string, number>()
  private snapshotId = 0

  constructor() {
    setInterval(this.publishRollingStats, 1000)
  }

  handleCommand(message: MainToWorkerMessage) {
    if (message.type === 'start') {
      this.start(message)
      return
    }
    if (message.type === 'setFocusedSymbol') {
      this.setFocusedSymbol(message.symbol)
      return
    }
    if (message.type === 'setGrouping') {
      this.setGrouping(message.grouping)
    }
  }

  private start(message: Extract<MainToWorkerMessage, { type: 'start' }>) {
    if (this.started) return
    this.started = true
    this.wsUrl = message.wsUrl
    this.focusedSymbol = message.focusedSymbol
    this.grouping = message.grouping
    this.resetFocusedData()
    this.connect()
  }

  private connect() {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return
    this.sendStatus({
      connectionStatus:
        this.reconnectAttempt > 0 ? 'reconnecting' : 'disconnected',
      lastError: null,
    })

    const socket = new WebSocket(this.wsUrl)
    this.socket = socket

    socket.addEventListener('open', () => {
      if (this.socket !== socket) return
      this.reconnectAttempt = 0
      this.sendStatus({
        connectionStatus: 'connected',
        lastError: null,
      })
      this.subscribeAll()
    })

    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      this.handleRawMessage(event.data)
    })

    socket.addEventListener('error', () => {
      this.sendStatus({
        connectionStatus: 'reconnecting',
        lastError: 'WebSocket error',
      })
    })

    socket.addEventListener('close', () => {
      if (this.socket !== socket) return
      this.socket = null
      this.scheduleReconnect()
    })
  }

  private scheduleReconnect() {
    if (!this.started || this.reconnectTimer !== null) return
    this.reconnectAttempt += 1
    const baseDelay = Math.min(
      30_000,
      500 * 2 ** Math.min(this.reconnectAttempt - 1, 8),
    )
    const jitter = 0.8 + Math.random() * 0.4
    const delay = Math.round(baseDelay * jitter)
    this.sendStatus({
      connectionStatus: 'reconnecting',
      lastError: `Retrying in ${(delay / 1000).toFixed(1)}s`,
    })
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private setFocusedSymbol(symbol: SymbolCode) {
    if (this.focusedSymbol === symbol) return
    const previousSymbol = this.focusedSymbol
    this.focusedSymbol = symbol
    this.grouping = SYMBOL_META[symbol].defaultGrouping
    this.resetFocusedData()

    if (!this.isOpen()) return
    this.sendSubscription({
      type: 'unsubscribe',
      payload: {
        channels: [
          { name: CHANNELS.orderbook, symbols: [previousSymbol] },
          { name: CHANNELS.trades, symbols: [previousSymbol] },
        ],
      },
    })
    this.subscribeFocusedSymbol(symbol)
  }

  private setGrouping(grouping: number) {
    if (this.grouping === grouping) return
    this.grouping = grouping
    this.previousBookSizes.clear()
    if (this.latestOrderBook?.symbol === this.focusedSymbol) {
      this.snapshotId += 1
      this.sendOrderBook(this.buildOrderBookView(this.latestOrderBook))
    } else if (this.pendingBook) {
      this.scheduleBookProcessing()
    } else {
      this.sendOrderBook(createOrderBookSnapshot(this.focusedSymbol, 'loading', grouping))
    }
  }

  private resetFocusedData() {
    this.pendingBook = null
    this.latestOrderBook = null
    this.pendingTrades = []
    this.tradeRows = []
    this.activeTradeRowsByPrice.clear()
    this.rollingSamples = []
    this.rollingSampleStart = 0
    this.rollingBuyVolume = 0
    this.rollingSellVolume = 0
    this.rollingTradeCount = 0
    this.rollingTotalSize = 0
    this.previousBookSizes.clear()
    this.snapshotId = 0
    this.send({ type: 'focus', symbol: this.focusedSymbol })
    this.sendOrderBook(
      createOrderBookSnapshot(this.focusedSymbol, 'loading', this.grouping),
    )
    this.sendTrades(createTradesSnapshot(this.focusedSymbol, 'loading'))
  }

  private subscribeAll() {
    this.sendSubscription({
      type: 'subscribe',
      payload: {
        channels: [
          { name: CHANNELS.ticker, symbols: [...SUPPORTED_SYMBOLS] },
          { name: CHANNELS.orderbook, symbols: [this.focusedSymbol] },
          { name: CHANNELS.trades, symbols: [this.focusedSymbol] },
        ],
      },
    })
  }

  private subscribeFocusedSymbol(symbol: SymbolCode) {
    this.sendSubscription({
      type: 'subscribe',
      payload: {
        channels: [
          { name: CHANNELS.orderbook, symbols: [symbol] },
          { name: CHANNELS.trades, symbols: [symbol] },
        ],
      },
    })
  }

  private sendSubscription(message: {
    type: 'subscribe' | 'unsubscribe'
    payload: { channels: SubscribeChannel[] }
  }) {
    if (!this.isOpen()) return
    this.socket?.send(JSON.stringify(message))
  }

  private isOpen() {
    return this.socket?.readyState === WebSocket.OPEN
  }

  private handleRawMessage(raw: string) {
    let message: MarketMessage
    try {
      message = JSON.parse(raw) as MarketMessage
    } catch {
      return
    }

    if (message.type === 'subscriptions') {
      return
    }

    if (!('symbol' in message) || !isSymbolCode(message.symbol)) return

    if (message.type === CHANNELS.ticker) {
      this.handleTicker(message)
      return
    }
    if (message.type === CHANNELS.orderbook) {
      this.handleOrderBook(message)
      return
    }
    if (message.type === CHANNELS.trades) {
      this.handleTrade(message)
    }
  }

  private handleTicker(message: TickerMessage) {
    const changePercent = (Number(message.ltp_change_24h) - 1) * 100
    const ticker: TickerView = {
      lastPriceLabel: formatPrice(message.symbol, message.close),
      changePercent,
      changeLabel: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
    }
    this.send({ type: 'ticker', symbol: message.symbol, snapshot: ticker })
  }

  private handleOrderBook(message: OrderbookMessage) {
    if (message.symbol !== this.focusedSymbol) return
    this.latestOrderBook = message
    this.pendingBook = { message }
    this.scheduleBookProcessing()
  }

  private handleTrade(message: TradeMessage) {
    if (message.symbol !== this.focusedSymbol) return
    this.pendingTrades.push(message)
    if (this.pendingTrades.length > MAX_PENDING_TRADES) {
      this.pendingTrades = this.pendingTrades.slice(-MAX_PENDING_TRADES)
    }
    this.addRollingTrade(message)
    if (!this.tradeFrameTimer) {
      this.tradeFrameTimer = setTimeout(this.flushTrades, FRAME_INTERVAL_MS)
    }
  }

  private scheduleBookProcessing() {
    if (this.bookFrameTimer) return
    this.bookFrameTimer = setTimeout(this.flushOrderBook, FRAME_INTERVAL_MS)
  }

  private flushOrderBook = () => {
    this.bookFrameTimer = null
    const pending = this.pendingBook
    this.pendingBook = null
    if (!pending || pending.message.symbol !== this.focusedSymbol) return
    this.snapshotId += 1
    this.sendOrderBook(this.buildOrderBookView(pending.message))
  }

  private buildOrderBookView(message: OrderbookMessage): OrderBookSnapshot {
    const askSide = this.buildBookSide(
      message.symbol,
      'ask',
      this.groupVisibleLevels(message.symbol, 'ask', message.asks),
    )
    const bidSide = this.buildBookSide(
      message.symbol,
      'bid',
      this.groupVisibleLevels(message.symbol, 'bid', message.bids),
    )
    const maxDepth = Math.max(askSide.maxCumulative, bidSide.maxCumulative, 1)
    this.applyDepthPercentages(askSide.levels, maxDepth)
    this.applyDepthPercentages(bidSide.levels, maxDepth)

    const bestAsk = askSide.levels[0]?.price ?? null
    const bestBid = bidSide.levels[0]?.price ?? null
    const spread = bestAsk !== null && bestBid !== null ? bestAsk - bestBid : null
    const midPrice =
      bestAsk !== null && bestBid !== null ? (bestAsk + bestBid) / 2 : null
    const spreadBps = spread !== null && midPrice ? (spread / midPrice) * 10_000 : null
    const imbalance = askSide.total > 0 ? bidSide.total / askSide.total : null

    return {
      symbol: message.symbol,
      status: 'ready',
      grouping: this.grouping,
      groupingOptions: SYMBOL_META[message.symbol].groupingIncrements,
      asks: askSide.levels.map(toBookLevelView),
      bids: bidSide.levels.map(toBookLevelView),
      metrics: {
        midPriceLabel:
          midPrice === null ? '--' : formatPrice(message.symbol, midPrice),
        spreadLabel: spread === null ? '--' : formatPrice(message.symbol, spread),
        spreadBpsLabel: spreadBps === null ? '--' : `${spreadBps.toFixed(2)} bps`,
        imbalanceLabel: imbalance === null ? '--' : `${imbalance.toFixed(2)}x`,
      },
    }
  }

  private groupVisibleLevels(
    symbol: SymbolCode,
    side: 'ask' | 'bid',
    levels: Array<[price: string, size: string]>,
  ) {
    return this.groupBestFirstVisibleLevels(symbol, side, levels)
  }

  private groupBestFirstVisibleLevels(
    symbol: SymbolCode,
    side: 'ask' | 'bid',
    levels: Array<[price: string, size: string]>,
  ) {
    const visible: GroupedLevel[] = []
    let previousRawPrice: number | null = null
    let currentPrice: number | null = null
    let currentSize = 0

    for (const [priceText, sizeText] of levels) {
      const price = Number(priceText)
      if (!Number.isFinite(price)) continue
      if (
        previousRawPrice !== null &&
        (side === 'ask' ? price < previousRawPrice : price > previousRawPrice)
      ) {
        return this.groupBoundedVisibleLevels(symbol, side, levels)
      }
      previousRawPrice = price

      const size = Number(sizeText)
      if (!Number.isFinite(size)) continue
      const groupedPrice = getGroupedPrice(symbol, side, price, this.grouping)

      if (currentPrice === null) {
        currentPrice = groupedPrice
      }

      if (groupedPrice !== currentPrice) {
        visible.push({ price: currentPrice, size: currentSize })
        if (visible.length >= VISIBLE_BOOK_LEVELS) return visible
        currentPrice = groupedPrice
        currentSize = 0
      }

      currentSize += size
    }

    if (currentPrice !== null) {
      visible.push({ price: currentPrice, size: currentSize })
    }

    return visible
  }

  private groupBoundedVisibleLevels(
    symbol: SymbolCode,
    side: 'ask' | 'bid',
    levels: Array<[price: string, size: string]>,
  ) {
    const visible: GroupedLevel[] = []
    const visibleByPrice = new Map<number, GroupedLevel>()

    for (const [priceText, sizeText] of levels) {
      const price = Number(priceText)
      const size = Number(sizeText)
      if (!Number.isFinite(price) || !Number.isFinite(size)) continue
      const groupedPrice = getGroupedPrice(symbol, side, price, this.grouping)
      const existing = visibleByPrice.get(groupedPrice)
      if (existing) {
        existing.size += size
        continue
      }

      const index = this.getVisibleLevelInsertIndex(visible, groupedPrice, side)
      if (index >= VISIBLE_BOOK_LEVELS) continue

      const level = { price: groupedPrice, size }
      visible.splice(index, 0, level)
      visibleByPrice.set(groupedPrice, level)

      if (visible.length > VISIBLE_BOOK_LEVELS) {
        const removed = visible.pop()
        if (removed) visibleByPrice.delete(removed.price)
      }
    }

    return visible
  }

  private getVisibleLevelInsertIndex(
    visible: GroupedLevel[],
    price: number,
    side: 'ask' | 'bid',
  ) {
    let index = 0
    while (
      index < visible.length &&
      (side === 'ask'
        ? visible[index].price < price
        : visible[index].price > price)
    ) {
      index += 1
    }
    return index
  }

  private buildBookSide(
    symbol: SymbolCode,
    side: 'ask' | 'bid',
    levels: GroupedLevel[],
  ): BookSideBuild {
    let cumulative = 0
    let maxCumulative = 0
    const views: BuiltBookLevel[] = new Array(levels.length)

    for (let index = 0; index < levels.length; index += 1) {
      const level = levels[index]
      cumulative += level.size
      maxCumulative = Math.max(maxCumulative, cumulative)
      const key = `${side}:${level.price}`
      const previous = this.previousBookSizes.get(key)
      let flash: BuiltBookLevel['flash'] = null
      if (previous && previous > 0) {
        const change = (level.size - previous) / previous
        if (Math.abs(change) > FLASH_THRESHOLD) {
          flash = change > 0 ? 'increase' : 'decrease'
        }
      }
      this.previousBookSizes.set(key, level.size)
      views[index] = {
        key,
        side,
        price: level.price,
        priceLabel: formatPrice(symbol, level.price),
        size: level.size,
        sizeLabel: formatSize(level.size),
        cumulative,
        cumulativeLabel: formatSize(cumulative),
        depthPercent: 0,
        flash,
        flashId: flash ? this.snapshotId : 0,
      }
    }

    return {
      levels: views,
      total: cumulative,
      maxCumulative,
    }
  }

  private applyDepthPercentages(levels: BuiltBookLevel[], maxDepth: number) {
    for (const level of levels) {
      level.depthPercent = (level.cumulative / maxDepth) * 100
    }
  }

  private flushTrades = () => {
    this.tradeFrameTimer = null
    const trades = this.pendingTrades
    this.pendingTrades = []
    if (trades.length === 0) return
    for (const trade of trades) this.mergeTrade(trade)
    this.pruneRollingSamples(Date.now())
    this.sendTrades(this.createTradesView())
  }

  private mergeTrade(trade: TradeMessage) {
    const price = Number(trade.price)
    if (!Number.isFinite(price)) return
    const timeMs = toMs(trade.timestamp)
    const side = inferTradeSide(trade)
    const priceKey = price.toFixed(SYMBOL_META[trade.symbol].precision)
    const activeRow = this.activeTradeRowsByPrice.get(priceKey)
    const canMerge =
      activeRow &&
      timeMs >= activeRow.windowStartMs &&
      timeMs - activeRow.windowStartMs <= TRADE_AGGREGATION_WINDOW_MS

    if (canMerge) {
      activeRow.size += trade.size
      activeRow.tradeCount += 1
      activeRow.timeMs = timeMs
      if (side === 'buy') activeRow.buyVolume += trade.size
      else activeRow.sellVolume += trade.size
      activeRow.side =
        activeRow.buyVolume >= activeRow.sellVolume ? 'buy' : 'sell'
      activeRow.view = this.createTradeRowView(activeRow)
      return
    }

    const rowWithoutView = {
      id: `${trade.symbol}:${priceKey}:${timeMs}:${this.tradeRows.length}`,
      symbol: trade.symbol,
      price,
      size: trade.size,
      tradeCount: 1,
      buyVolume: side === 'buy' ? trade.size : 0,
      sellVolume: side === 'sell' ? trade.size : 0,
      windowStartMs: timeMs,
      timeMs,
      side,
    }
    const row: MutableTradeAggregate = {
      ...rowWithoutView,
      view: this.createTradeRowView(rowWithoutView),
    }
    this.tradeRows.unshift(row)
    this.activeTradeRowsByPrice.set(priceKey, row)
    while (this.tradeRows.length > MAX_TRADE_ROWS) {
      const removed = this.tradeRows.pop()
      if (!removed) break
      const removedKey = removed.price.toFixed(SYMBOL_META[removed.symbol].precision)
      if (this.activeTradeRowsByPrice.get(removedKey) === removed) {
        this.activeTradeRowsByPrice.delete(removedKey)
      }
    }
  }

  private addRollingTrade(trade: TradeMessage) {
    const side = inferTradeSide(trade)
    const sample: RollingTradeSample = {
      timeMs: toMs(trade.timestamp),
      side,
      size: trade.size,
    }
    this.rollingSamples.push(sample)
    this.rollingTradeCount += 1
    this.rollingTotalSize += sample.size
    if (side === 'buy') this.rollingBuyVolume += sample.size
    else this.rollingSellVolume += sample.size
    this.pruneRollingSamples(sample.timeMs)
  }

  private pruneRollingSamples(nowMs: number) {
    const cutoff = nowMs - ROLLING_STATS_WINDOW_MS
    while (
      this.rollingSampleStart < this.rollingSamples.length &&
      this.rollingSamples[this.rollingSampleStart].timeMs < cutoff
    ) {
      const sample = this.rollingSamples[this.rollingSampleStart]
      this.rollingSampleStart += 1
      this.rollingTradeCount -= 1
      this.rollingTotalSize -= sample.size
      if (sample.side === 'buy') this.rollingBuyVolume -= sample.size
      else this.rollingSellVolume -= sample.size
    }
    if (
      this.rollingSampleStart > 1024 &&
      this.rollingSampleStart * 2 > this.rollingSamples.length
    ) {
      this.rollingSamples = this.rollingSamples.slice(this.rollingSampleStart)
      this.rollingSampleStart = 0
    }
  }

  private createTradesView(): TradesSnapshot {
    const visibleRows = this.tradeRows.slice(0, VISIBLE_TRADE_ROWS)

    return {
      symbol: this.focusedSymbol,
      status: this.tradeRows.length > 0 ? 'ready' : 'loading',
      rows: visibleRows.map((row) => row.view),
      stats: this.getRollingStats(),
    }
  }

  private createTradeRowView(
    row: Omit<MutableTradeAggregate, 'view'>,
  ): TradeRowView {
    const notional = row.price * row.size
    return {
      id: row.id,
      priceLabel: formatPrice(row.symbol, row.price),
      sizeLabel: formatSize(row.size),
      tradeCount: row.tradeCount,
      tradeCountLabel: row.tradeCount > 1 ? `x${row.tradeCount}` : '1',
      side: row.side,
      timeLabel: formatTime(row.timeMs),
      notionalLabel: formatNotional(notional),
    }
  }

  private getRollingStats(): TradeStats {
    return {
      buyVolume: Math.max(0, this.rollingBuyVolume),
      sellVolume: Math.max(0, this.rollingSellVolume),
      tradeCount: Math.max(0, this.rollingTradeCount),
      averageTradeSize:
        this.rollingTradeCount > 0
          ? this.rollingTotalSize / this.rollingTradeCount
          : 0,
    }
  }

  private publishRollingStats = () => {
    this.pruneRollingSamples(Date.now())
    if (this.tradeRows.length === 0 && this.getRollingSampleCount() === 0) return
    this.sendTrades(this.createTradesView())
  }

  private getRollingSampleCount() {
    return this.rollingSamples.length - this.rollingSampleStart
  }

  private sendOrderBook(snapshot: OrderBookSnapshot) {
    this.send({ type: 'orderbook', snapshot })
  }

  private sendTrades(snapshot: TradesSnapshot) {
    this.send({ type: 'trades', snapshot })
  }

  private sendStatus(patch: Partial<StatusSnapshot>) {
    this.send({ type: 'status', patch })
  }

  private send(message: WorkerToMainMessage) {
    workerScope.postMessage(message)
  }
}

const runtime = new MarketDataWorkerRuntime()

workerScope.addEventListener('message', (event) => {
  runtime.handleCommand(event.data)
})
