export const SUPPORTED_SYMBOLS = [
  'BTCUSD',
  'ETHUSD',
  'XRPUSD',
  'SOLUSD',
  'PAXGUSD',
  'DOGEUSD',
] as const

export type SymbolCode = (typeof SUPPORTED_SYMBOLS)[number]

export const CHANNELS = {
  trades: 'all_trades',
  orderbook: 'l2_orderbook',
  ticker: 'v2/ticker',
} as const

export type MarketChannel = (typeof CHANNELS)[keyof typeof CHANNELS]

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected'

export type Side = 'buy' | 'sell'

export interface SymbolMeta {
  min: number
  max: number
  precision: number
  groupingIncrements: number[]
  defaultGrouping: number
}

export const SYMBOL_META: Record<SymbolCode, SymbolMeta> = {
  BTCUSD: {
    min: 60000,
    max: 65000,
    precision: 1,
    groupingIncrements: [1, 5, 10, 50, 100, 500],
    defaultGrouping: 1,
  },
  ETHUSD: {
    min: 1500,
    max: 2000,
    precision: 2,
    groupingIncrements: [0.5, 1, 5, 10, 50],
    defaultGrouping: 0.5,
  },
  XRPUSD: {
    min: 1,
    max: 2,
    precision: 4,
    groupingIncrements: [0.0001, 0.001, 0.01, 0.1],
    defaultGrouping: 0.0001,
  },
  SOLUSD: {
    min: 70,
    max: 80,
    precision: 4,
    groupingIncrements: [0.0001, 0.001, 0.01, 0.1, 1],
    defaultGrouping: 0.001,
  },
  PAXGUSD: {
    min: 5000,
    max: 5500,
    precision: 2,
    groupingIncrements: [0.5, 1, 5, 10, 50],
    defaultGrouping: 1,
  },
  DOGEUSD: {
    min: 0,
    max: 0.1,
    precision: 6,
    groupingIncrements: [0.000001, 0.00001, 0.0001, 0.001, 0.01],
    defaultGrouping: 0.00001,
  },
}

export interface SubscribeChannel {
  name: MarketChannel
  symbols?: SymbolCode[]
}

export interface SubscriptionRequest {
  type: 'subscribe' | 'unsubscribe'
  payload: {
    channels: SubscribeChannel[]
  }
}

export interface SubscriptionsMessage {
  type: 'subscriptions'
}

export interface TickerMessage {
  type: 'v2/ticker'
  symbol: SymbolCode
  close: number
  ltp_change_24h: string
}

export interface OrderbookMessage {
  type: 'l2_orderbook'
  symbol: SymbolCode
  bids: Array<[price: string, size: string]>
  asks: Array<[price: string, size: string]>
}

export interface TradeMessage {
  type: 'all_trades'
  buyer_role: 'maker' | 'taker'
  price: string
  seller_role: 'maker' | 'taker'
  size: number
  symbol: SymbolCode
  timestamp: number
}

export type MarketMessage =
  | TickerMessage
  | OrderbookMessage
  | TradeMessage
  | SubscriptionsMessage

export const isSymbolCode = (value: string): value is SymbolCode =>
  SUPPORTED_SYMBOLS.includes(value as SymbolCode)

export const formatGroupingIncrement = (symbol: SymbolCode, value: number) => {
  const precision = SYMBOL_META[symbol].precision
  if (value >= 1) return value.toFixed(value % 1 === 0 ? 0 : precision)
  return value.toFixed(precision)
}
