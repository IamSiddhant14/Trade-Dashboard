import { memo } from 'react'
import { marketDataActions, useFocusedSymbol, useTickerData } from '../hooks/useMarketData'
import { SUPPORTED_SYMBOLS, type SymbolCode } from '../types/marketData'

interface TickerTileProps {
  symbol: SymbolCode
  isFocused: boolean
}

const TickerTile = memo(function TickerTile({
  symbol,
  isFocused,
}: TickerTileProps) {
  const ticker = useTickerData(symbol)
  const direction = ticker && ticker.changePercent >= 0 ? 'positive' : 'negative'

  return (
    <button
      type="button"
      className={`ticker-tile ${isFocused ? 'is-focused' : ''}`}
      onClick={() => marketDataActions.setFocusedSymbol(symbol)}
      aria-pressed={isFocused}
    >
      <span className="ticker-symbol">{symbol}</span>
      <span className="ticker-price">{ticker?.lastPriceLabel ?? '--'}</span>
      <span className={`ticker-change ${direction}`}>
        {ticker?.changeLabel ?? '--'}
      </span>
    </button>
  )
})

export function TickerBar() {
  const { symbol: focusedSymbol } = useFocusedSymbol()

  return (
    <section className="ticker-bar" aria-label="Multi-product ticker bar">
      {SUPPORTED_SYMBOLS.map((symbol) => (
        <TickerTile
          key={symbol}
          symbol={symbol}
          isFocused={symbol === focusedSymbol}
        />
      ))}
    </section>
  )
}
