import { marketDataStore } from "./marketDataStore";

const DEFAULT_WS_URL = "ws://localhost:8080";
const DEFAULT_RUNTIME_URLS = ["http://localhost:3002", "http://localhost:3000"];

class MarketDataClient {
  private Worker: Worker | null = null;
  private started = false;

  private get wsUrl() {
    return import.meta.env.VITE_MARKET_WS_URL ?? DEFAULT_WS_URL;
  }

  private get runtimeUrls() {
    const configuredUrl = import.meta.env.VITE_MARKET_HTTP_URL;
    return configuredUrl ? [configuredUrl] : DEFAULT_RUNTIME_URLS;
  }

  start(){
    if (this.started) return;
    this.started = true;

  }
}
