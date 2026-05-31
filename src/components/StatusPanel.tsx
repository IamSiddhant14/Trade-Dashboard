import { useState } from 'react'
import { marketDataActions, useConnectionStatus } from '../hooks/useMarketData'
import type { RuntimeLoadPreset } from '../services/marketDataClient'

export function StatusPanel() {
  const status = useConnectionStatus()
  const [activePreset, setActivePreset] = useState<RuntimeLoadPreset>('normal')
  const [pendingPreset, setPendingPreset] = useState<RuntimeLoadPreset | null>(
    null,
  )
  const [presetError, setPresetError] = useState<string | null>(null)

  const applyPreset = async (preset: RuntimeLoadPreset) => {
    setPendingPreset(preset)
    setPresetError(null)
    try {
      await marketDataActions.applyRuntimePreset(preset)
      setActivePreset(preset)
    } catch (error) {
      setPresetError(error instanceof Error ? error.message : 'Update failed')
    } finally {
      setPendingPreset(null)
    }
  }

  return (
    <section className="status-panel" aria-label="Connection and load status">
      <div className={`status-pill ${status.connectionStatus}`}>
        <span className="status-dot" />
        {status.connectionStatus}
      </div>
      <div className="load-toggle" aria-label="Backend load controls">
        <button
          type="button"
          className={activePreset === 'normal' ? 'active' : ''}
          disabled={pendingPreset !== null}
          onClick={() => void applyPreset('normal')}
        >
          {pendingPreset === 'normal' ? 'Applying...' : 'Normal'}
        </button>
        <button
          type="button"
          className={activePreset === 'stress' ? 'active stress' : 'stress'}
          disabled={pendingPreset !== null}
          onClick={() => void applyPreset('stress')}
        >
          {pendingPreset === 'stress' ? 'Applying...' : 'Stress Test'}
        </button>
      </div>
      {status.lastError && (
        <div>
          <strong>{status.lastError}</strong>
        </div>
      )}
      {presetError && (
        <div>
          <strong>{presetError}</strong>
        </div>
      )}
    </section>
  )
}
