import { useEffect } from "react";
import {
  marketDataClient,
} from '../services/marketDataClient'

export const useMarketDataConnection = () => {
  useEffect(() => {
    marketDataClient.start()
  }, []);
};

