import { useEffect, useSyncExternalStore } from "react";
import {
  marketDataClient,
  type RuntimeLoadPreset,
} from '../services/marketDataClient'
import type { SymbolCode } from "../types/marketData";
import { marketDataStore } from "../services/marketDataStore";

export const useMarketDataConnection = () => {
  useEffect(() => {
    marketDataClient.start()
  }, []);
};

export const useConnectionStatus = () =>
  useSyncExternalStore(
    marketDataStore.subscribeStatus,
    marketDataStore.getStatusSnapshot,
  );

export const marketDataActions = {
  setFocusedSymbol: (symbol: SymbolCode) =>
    marketDataClient.setFocusedSymbol(symbol),
  setGrouping: (grouping: number) => marketDataClient.setGrouping(grouping),
  applyRuntimePreset: (preset: RuntimeLoadPreset) =>
    marketDataClient.applyRuntimePreset(preset),
};