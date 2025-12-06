/**
 * Tiingo IEX WebSocket Service
 * 
 * Provides real-time price updates from Tiingo IEX WebSocket API
 * Replaces FMP WebSocket for real-time ETF price streaming
 */

import { ETF } from "@/types/etf";

// Tiingo IEX WebSocket endpoint
const TIINGO_WS_URL = 'wss://api.tiingo.com/iex';

// Get API key from environment
const TIINGO_API_KEY = (import.meta as any).env.VITE_TIINGO_API_KEY || '';

// Store ETFs for updates
let cachedETFs: ETF[] = [];

type PriceUpdate = {
    symbol: string;
    price: number;
    change: number;
    bid?: number;
    ask?: number;
    volume?: number;
    timestamp?: string;
};

type WebSocketCallback = (updates: Map<string, PriceUpdate>) => void;

/**
 * Tiingo IEX WebSocket message types:
 * Message format: [messageType, data]
 * messageType: "A" = Ask update, "B" = Bid update, "Q" = Quote, "T" = Trade
 * 
 * Trade/Quote data fields:
 * - ticker: string
 * - tngoLast: number (Tiingo calculated reference price)
 * - last: number (last trade price)
 * - prevClose: number
 * - open: number
 * - high: number
 * - low: number
 * - mid: number
 * - bidPrice: number
 * - askPrice: number
 * - volume: number
 * - timestamp: string
 */
interface TiingoIEXMessage {
    messageType: string;
    data: {
        ticker: string;
        tngoLast?: number;
        last?: number;
        prevClose?: number;
        open?: number;
        high?: number;
        low?: number;
        mid?: number;
        bidPrice?: number;
        bidSize?: number;
        askPrice?: number;
        askSize?: number;
        volume?: number;
        timestamp?: string;
        lastSaleTimestamp?: string;
    };
}

class TiingoWebSocketService {
    private socket: WebSocket | null = null;
    private priceData: Map<string, PriceUpdate> = new Map();
    private prevCloseData: Map<string, number> = new Map();
    private subscribers: Set<WebSocketCallback> = new Set();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private subscribedSymbols: Set<string> = new Set();
    private isConnecting = false;
    private heartbeatInterval: NodeJS.Timeout | null = null;

    connect() {
        if (this.socket?.readyState === WebSocket.OPEN || this.isConnecting) {
            return;
        }

        if (!TIINGO_API_KEY) {
            console.error('Tiingo API key not configured. Set VITE_TIINGO_API_KEY in .env');
            return;
        }

        this.isConnecting = true;
        console.log('Connecting to Tiingo IEX WebSocket...');

        try {
            // Connect with authorization token in query param
            this.socket = new WebSocket(`${TIINGO_WS_URL}?token=${TIINGO_API_KEY}`);

            this.socket.addEventListener('open', () => {
                console.log('WebSocket connected to Tiingo IEX');
                this.isConnecting = false;
                this.reconnectAttempts = 0;

                // Subscribe to all previously requested symbols
                if (this.subscribedSymbols.size > 0) {
                    this.sendSubscribe([...this.subscribedSymbols]);
                }

                // Start heartbeat to keep connection alive
                this.startHeartbeat();
            });

            this.socket.addEventListener('message', (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('Error parsing Tiingo WebSocket message:', error);
                }
            });

            this.socket.addEventListener('error', (error) => {
                console.error('Tiingo WebSocket error:', error);
                this.isConnecting = false;
            });

            this.socket.addEventListener('close', () => {
                console.log('Tiingo WebSocket connection closed');
                this.isConnecting = false;
                this.socket = null;
                this.stopHeartbeat();
                this.attemptReconnect();
            });
        } catch (error) {
            console.error('Error creating Tiingo WebSocket:', error);
            this.isConnecting = false;
            this.attemptReconnect();
        }
    }

    private startHeartbeat() {
        this.stopHeartbeat();
        // Send heartbeat every 30 seconds to keep connection alive
        this.heartbeatInterval = setInterval(() => {
            if (this.socket?.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ eventName: 'heartbeat' }));
            }
        }, 30000);
    }

    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    private handleMessage(message: any) {
        // Tiingo sends messages as arrays or objects
        // Format: {"messageType": "A/T/Q", "data": {...}} or array format

        if (message.messageType === 'H') {
            // Heartbeat response, ignore
            return;
        }

        if (message.messageType === 'I') {
            // Info message about subscription
            console.log('Tiingo subscription info:', message.data);
            return;
        }

        if (message.messageType === 'E') {
            // Error message
            console.error('Tiingo WebSocket error:', message.data);
            return;
        }

        // Handle trade and quote updates
        if (message.messageType === 'T' || message.messageType === 'Q' || message.messageType === 'A') {
            const data = message.data;
            if (!data || !data.ticker) return;

            const ticker = data.ticker.toUpperCase();
            const currentPrice = data.tngoLast || data.last || data.mid || 0;

            // Get previous close for change calculation
            let prevClose = this.prevCloseData.get(ticker);
            if (!prevClose && data.prevClose) {
                prevClose = data.prevClose;
                this.prevCloseData.set(ticker, prevClose);
            }

            const change = prevClose ? currentPrice - prevClose : 0;

            if (currentPrice > 0) {
                this.priceData.set(ticker, {
                    symbol: ticker,
                    price: currentPrice,
                    change,
                    bid: data.bidPrice,
                    ask: data.askPrice,
                    volume: data.volume,
                    timestamp: data.lastSaleTimestamp || data.timestamp,
                });

                // Notify all subscribers
                this.notifySubscribers();
            }
        }
    }

    private attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Tiingo WebSocket: Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

        console.log(`Tiingo WebSocket: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        this.reconnectTimeout = setTimeout(() => {
            this.connect();
        }, delay);
    }

    private sendSubscribe(symbols: string[]) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            const subscribeMessage = JSON.stringify({
                eventName: 'subscribe',
                authorization: TIINGO_API_KEY,
                eventData: {
                    thresholdLevel: 5, // Balance between updates and data volume
                    tickers: symbols.map(s => s.toUpperCase()),
                },
            });
            this.socket.send(subscribeMessage);
            console.log(`Tiingo WebSocket: Subscribed to ${symbols.length} symbols`);
        }
    }

    private sendUnsubscribe(symbols: string[]) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            const unsubscribeMessage = JSON.stringify({
                eventName: 'unsubscribe',
                authorization: TIINGO_API_KEY,
                eventData: {
                    tickers: symbols.map(s => s.toUpperCase()),
                },
            });
            this.socket.send(unsubscribeMessage);
            console.log(`Tiingo WebSocket: Unsubscribed from ${symbols.length} symbols`);
        }
    }

    subscribeToSymbols(symbols: string[]) {
        symbols.forEach(symbol => {
            this.subscribedSymbols.add(symbol.toUpperCase());
        });

        if (this.socket?.readyState === WebSocket.OPEN) {
            this.sendSubscribe(symbols.map(s => s.toUpperCase()));
        }
    }

    unsubscribeFromSymbols(symbols: string[]) {
        symbols.forEach(symbol => {
            this.subscribedSymbols.delete(symbol.toUpperCase());
        });

        if (this.socket?.readyState === WebSocket.OPEN) {
            this.sendUnsubscribe(symbols.map(s => s.toUpperCase()));
        }
    }

    subscribe(callback: WebSocketCallback) {
        this.subscribers.add(callback);

        // Immediately notify with current data
        if (this.priceData.size > 0) {
            callback(this.priceData);
        }

        return () => {
            this.subscribers.delete(callback);
        };
    }

    private notifySubscribers() {
        this.subscribers.forEach(callback => {
            callback(this.priceData);
        });
    }

    getCurrentPrices(): Map<string, PriceUpdate> {
        return new Map(this.priceData);
    }

    disconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        this.stopHeartbeat();

        if (this.socket) {
            // Unsubscribe from all symbols
            if (this.subscribedSymbols.size > 0) {
                this.sendUnsubscribe([...this.subscribedSymbols]);
            }

            this.socket.close();
            this.socket = null;
        }

        this.subscribedSymbols.clear();
        this.priceData.clear();
        this.prevCloseData.clear();
        this.subscribers.clear();
        this.reconnectAttempts = 0;
    }

    isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }
}

// Singleton instance
const tiingoWS = new TiingoWebSocketService();

export const initializeTiingoWebSocket = (etfs: ETF[]) => {
    cachedETFs = etfs;
    tiingoWS.connect();

    // Subscribe to all ETF symbols
    const symbols = etfs.map(etf => etf.symbol);
    tiingoWS.subscribeToSymbols(symbols);
};

export const subscribeToTiingoUpdates = (callback: (etfs: ETF[]) => void) => {
    return tiingoWS.subscribe((priceUpdates) => {
        const updatedETFs = cachedETFs.map(etf => {
            const priceUpdate = priceUpdates.get(etf.symbol.toUpperCase());

            if (priceUpdate) {
                return {
                    ...etf,
                    price: priceUpdate.price,
                    priceChange: priceUpdate.change,
                };
            }

            return etf;
        });

        callback(updatedETFs);
    });
};

export const updateTiingoCachedETFs = (etfs: ETF[]) => {
    cachedETFs = etfs;
};

export const disconnectTiingoWebSocket = () => {
    tiingoWS.disconnect();
};

export const isTiingoWebSocketConnected = () => {
    return tiingoWS.isConnected();
};

export default tiingoWS;
