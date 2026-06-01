import { memo, type ChangeEvent } from 'react'
import { marketDataActions, useOrderBookData } from '../hooks/useMarketData'
import type { BookLevelView } from '../services/marketDataStore'
import { formatGroupingIncrement } from '../types/marketData'

const areRowsEqual = (
  previous: { level: BookLevelView },
  next: { level: BookLevelView },
) => {
  const previousLevel = previous.level
  const nextLevel = next.level
  return (
    previousLevel.key === nextLevel.key &&
    previousLevel.priceLabel === nextLevel.priceLabel &&
    previousLevel.sizeLabel === nextLevel.sizeLabel &&
    previousLevel.cumulativeLabel === nextLevel.cumulativeLabel &&
    previousLevel.depthPercent === nextLevel.depthPercent &&
    previousLevel.flash === nextLevel.flash &&
    previousLevel.flashId === nextLevel.flashId
  )
}

const OrderBookRow = memo(function OrderBookRow({
  level,
}: {
  level: BookLevelView
}) {
  const depthScale = Math.min(1, level.depthPercent / 100)

  return (
    <div
      className={`book-row ${level.side} ${level.flash ? `flash-${level.flash}` : ''}`}
    >
      <div
        className="depth-bar"
        style={{ transform: `scaleX(${depthScale})` }}
      />
      {level.side === 'ask' ? (
        <>
          <span>{level.cumulativeLabel}</span>
          <span>{level.sizeLabel}</span>
          <span className="book-price">{level.priceLabel}</span>
        </>
      ) : (
        <>
          <span className="book-price">{level.priceLabel}</span>
          <span>{level.sizeLabel}</span>
          <span>{level.cumulativeLabel}</span>
        </>
      )}
    </div>
  )
}, areRowsEqual)

const getOrderBookRowKey = (level: BookLevelView) =>
  level.flashId ? `${level.key}:${level.flashId}` : level.key

export function OrderBook() {
  const orderBook = useOrderBookData()
  const baseAsset = orderBook.symbol.replace('USD', '')
  const handleGroupingChange = (event: ChangeEvent<HTMLSelectElement>) => {
    marketDataActions.setGrouping(Number(event.target.value))
  }

  return (
    <section className="panel orderbook-panel">
      <div className="panel-header">
        <div>
          <h2>
            Order Book — {orderBook.symbol}{' '}
          </h2>
        </div>
        <label className="group-select-label">
          <span>Group:</span>
          <select
            className="group-select"
            value={orderBook.grouping}
            onChange={handleGroupingChange}
            aria-label="Order book grouping"
          >
            {orderBook.groupingOptions.map((option) => (
              <option key={option} value={option}>
                {formatGroupingIncrement(orderBook.symbol, option)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="book-table" aria-busy={orderBook.status === 'loading'}>
        <div className="book-row book-head">
          <span>Total ({baseAsset})</span>
          <span>Size ({baseAsset})</span>
          <span>Price (USD)</span>
        </div>
        {orderBook.status === 'loading' ? (
          <div className="empty-state">Waiting for {orderBook.symbol} book...</div>
        ) : (
          <>
            <div className="book-side asks">
              {orderBook.asks.map((level) => (
                <OrderBookRow key={getOrderBookRowKey(level)} level={level} />
              ))}
            </div>
            <div className="spread-row">
              <div>
                <span>Mid Price</span>
                <strong>{orderBook.metrics.midPriceLabel}</strong>
              </div>
              <div>
                <span>Spread</span>
                <strong>
                  {orderBook.metrics.spreadLabel} ({orderBook.metrics.spreadBpsLabel})
                </strong>
              </div>
              <div>
                <span>Imbalance</span>
                <strong>{orderBook.metrics.imbalanceLabel} bid heavy</strong>
              </div>
            </div>
            <div className="book-row book-head">
              <span>Price (USD)</span>
              <span>Size ({baseAsset})</span>
              <span>Total ({baseAsset})</span>
            </div>
            <div className="book-side bids">
              {orderBook.bids.map((level) => (
                <OrderBookRow key={getOrderBookRowKey(level)} level={level} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
