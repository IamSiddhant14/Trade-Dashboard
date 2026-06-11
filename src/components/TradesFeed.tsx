import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useTradesData } from '../hooks/useMarketData'
import type { TradeRowView } from '../types/marketData'

const BOTTOM_THRESHOLD_PX = 24

const TradeRow = memo(function TradeRow({ trade }: { trade: TradeRowView }) {
  return (
    <div
      className={`trade-row ${trade.side}`}
      title={`Notional $${trade.notionalLabel} · ${trade.tradeCount} trade${trade.tradeCount === 1 ? '' : 's'}`}
    >
      <span>{trade.timeLabel}</span>
      <span>{trade.priceLabel}</span>
      <span>{trade.sizeLabel}</span>
      <span className="trade-count">{trade.tradeCountLabel}</span>
      <span className="trade-side">{trade.side}</span>
    </div>
  )
}, areTradeRowsEqual)

function areTradeRowsEqual(
  previous: { trade: TradeRowView },
  next: { trade: TradeRowView },
) {
  const previousTrade = previous.trade
  const nextTrade = next.trade
  return (
    previousTrade.id === nextTrade.id &&
    previousTrade.side === nextTrade.side &&
    previousTrade.tradeCount === nextTrade.tradeCount &&
    previousTrade.timeLabel === nextTrade.timeLabel &&
    previousTrade.priceLabel === nextTrade.priceLabel &&
    previousTrade.sizeLabel === nextTrade.sizeLabel &&
    previousTrade.notionalLabel === nextTrade.notionalLabel
  )
}

function renderTradeRows(rows: TradeRowView[]) {
  const renderedRows = []

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const trade = rows[index]
    renderedRows.push(<TradeRow key={trade.id} trade={trade} />)
  }
  return renderedRows
}

export function TradesFeed() {
  const trades = useTradesData()
  const listRef = useRef<HTMLDivElement | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const isPinnedRef = useRef(true)
  const [isPinned, setIsPinned] = useState(true)

  const setPinned = (nextIsPinned: boolean) => {
    if (isPinnedRef.current === nextIsPinned) return
    isPinnedRef.current = nextIsPinned
    setIsPinned(nextIsPinned)
  }

  const scrollToLatest = useCallback(() => {
    const element = listRef.current
    if (!element) return
    const scrollToBottom = () => {
      element.scrollTop = element.scrollHeight - element.clientHeight
    }

    scrollToBottom()
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current)
    }
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null
      scrollToBottom()
    })
  }, [])

  useLayoutEffect(() => {
    if (!isPinnedRef.current) return
    scrollToLatest()
  }, [scrollToLatest, trades.rows])

  useLayoutEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current)
      }
    }
  }, [])

  const handleScroll = () => {
    const element = listRef.current
    if (!element) return
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight
    setPinned(distanceFromBottom <= BOTTOM_THRESHOLD_PX)
  }

  const jumpToLatest = () => {
    setPinned(true)
    scrollToLatest()
  }

  return (
    <section className="panel trades-panel">
      <div className="panel-header">
        <div>
          <h2>Recent Trades — {trades.symbol}</h2>
        </div>
      </div>

      <div className="trade-stats">
        <Metric
          label="1m Volume"
          value={`${trades.stats.buyVolume.toFixed(1)} buy · ${trades.stats.sellVolume.toFixed(1)} sell`}
        />
        <Metric label="1m Trades" value={String(trades.stats.tradeCount)} />
        <Metric
          label="Avg size"
          value={trades.stats.averageTradeSize.toFixed(2)}
        />
      </div>

      <div className="trade-list-wrap">
        <div
          ref={listRef}
          className="trade-list"
          onScroll={handleScroll}
          aria-busy={trades.status === 'loading'}
        >
          <div className="trade-row trade-head">
            <span>Time</span>
            <span>Price</span>
            <span>Size</span>
            <span>Count</span>
            <span>Side</span>
          </div>
          {trades.status === 'loading' ? (
            <div className="empty-state">Waiting for {trades.symbol} trades...</div>
          ) : (
            renderTradeRows(trades.rows)
          )}
        </div>
        {!isPinned && (
          <button type="button" className="jump-button" onClick={jumpToLatest}>
            Jump to latest
          </button>
        )}
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="trade-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
