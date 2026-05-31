import { OrderBook } from './components/OrderBook'
import { StatusPanel } from './components/StatusPanel'
import { TickerBar } from './components/TickerBar'
import { TradesFeed } from './components/TradesFeed'
import { useMarketDataConnection } from './hooks/useMarketData'
import './App.css'

function App() {
  useMarketDataConnection()

  return (
    <main className="app-shell">
      <StatusPanel />
      <TickerBar />
      <section className="dashboard-grid">
        <OrderBook />
        <TradesFeed />
      </section>
      <footer className="legend-bar">
        <span>
          <i className="legend-dot red" /> Size down &gt;10%
        </span>
        <span>
          <i className="legend-dot green" /> Size up &gt;10%
        </span>
        <span>
          <i className="legend-dot depth" /> Depth bar
        </span>
        <span>
          <i className="legend-dot yellow" /> Large trade
        </span>
      </footer>
    </main>
  )
}

export default App
