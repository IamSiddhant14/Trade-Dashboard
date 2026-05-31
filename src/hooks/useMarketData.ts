import { useEffect, useSyncExternalStore } from "react";
import {
  marketDataClient,
  type RuntimeLoadPreset,
} from "../services/marketDataClient";
import { marketDataStore } from "../services/marketDataStore";
import type { SymbolCode } from "../types/marketData";

export const useMarketDataConnection = () => {
  useEffect(() => {
    marketDataClient.start();
  }, []);
};

export const useFocusedSymbol = () =>
  useSyncExternalStore(
    marketDataStore.subscribeFocusedSymbol,
    marketDataStore.getFocusedSymbolSnapshot,
  );

export const useTickerData = (symbol: SymbolCode) =>
  useSyncExternalStore(
    (listener) => marketDataStore.subscribeTicker(symbol, listener),
    () => marketDataStore.getTickerSnapshot(symbol),
  );

export const useOrderBookData = () =>
  useSyncExternalStore(
    marketDataStore.subscribeOrderBook,
    marketDataStore.getOrderBookSnapshot,
  );

export const useTradesData = () =>
  useSyncExternalStore(
    marketDataStore.subscribeTrades,
    marketDataStore.getTradesSnapshot,
  );

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