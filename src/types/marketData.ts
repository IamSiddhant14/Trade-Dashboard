export const SUPPORTED_SYMBOLS = [
    'BTCUSD',
    'ETHUSD',
    'XRPUSD',
    'SOLUSD',
    'PAXGUSD',
    'DOGEUSD',
  ] as const

export type SymbolCode = (typeof SUPPORTED_SYMBOLS)[number]

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected'

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
