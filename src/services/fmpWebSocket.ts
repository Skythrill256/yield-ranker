/**
 * FMP WebSocket Service
 * 
 * Provides real-time price updates from Financial Modeling Prep WebSocket API
 * Replaces Finnhub WebSocket for real-time ETF price streaming
 */

import { ETF } from "@/types/etf";

// FMP WebSocket endpoint
const FMP_WS_URL = 'wss://websockets.financialmodelingprep.com';

// Get API key from environment
const FMP_API_KEY = (import.meta as any).env.VITE_FMP_API_KEY || '';

// Store ETFs for updates
let cachedETFs: ETF[] = [];

type PriceUpdate = {
    symbol: string;
    price: number;
    change: number;
    bid?: number;
    ask?: number;
    volume?: number;
    timestamp?: number;
};

type WebSocketCallback = (updates: Map<string, PriceUpdate>) => void;

/**
 * FMP WebSocket response types:
 * - s: symbol
 * - lp: last price
 * - ls: last volume
 * - bp: bid price
 * - ap: ask price
 * - t: timestamp
 * - type: 'T' (trade), 'Q' (quote), 'B' (break)
 */
interface FMPWebSocketMessage {
    s: string;      // Symbol
    lp?: number;    // Last price
    ls?: number;    // Last volume
    bp?: number;    // Bid price
    ap?: number;    // Ask price
    bs?: number;    // Bid size
    as?: number;    // Ask size
    t?: number;     // Timestamp
    type?: 'T' | 'Q' | 'B';
}

class FMPWebSocketService {
    private socket: WebSocket | null = null;
    private priceData: Map<string, PriceUpdate> = new Map();
    private subscribers: Set<WebSocketCallback> = new Set();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private subscribedSymbols: Set<string> = new Set();
    private isConnecting = false;
    private isAuthenticated = false;

    connect() {
        if (this.socket?.readyState === WebSocket.OPEN || this.isConnecting) {
            return;
        }

        if (!FMP_API_KEY) {
            console.error('FMP API key not configured. Set VITE_FMP_API_KEY in .env');
            return;
        }

        this.isConnecting = true;
        console.log('Connecting to FMP WebSocket...');

        try {
            this.socket = new WebSocket(FMP_WS_URL);

            this.socket.addEventListener('open', () => {
                console.log('WebSocket connected to FMP');
                this.isConnecting = false;
                this.reconnectAttempts = 0;

                // Authenticate with API key
                this.authenticate();
            });

            this.socket.addEventListener('message', (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // Handle authentication response
                    if (data.event === 'login') {
                        if (data.status === 'success') {
                            console.log('FMP WebSocket authenticated');
                            this.isAuthenticated = true;

                            // Subscribe to all previously requested symbols
                            if (this.subscribedSymbols.size > 0) {
                                this.sendSubscribe([...this.subscribedSymbols]);
                            }
                        } else {
                            console.error('FMP WebSocket authentication failed:', data);
                        }
                        return;
                    }

                    // Handle price updates
                    if (Array.isArray(data)) {
                        data.forEach((msg: FMPWebSocketMessage) => this.handlePriceMessage(msg));
                    } else if (data.s) {
                        this.handlePriceMessage(data as FMPWebSocketMessage);
                    }

                } catch (error) {
                    console.error('Error parsing FMP WebSocket message:', error);
                }
            });

            this.socket.addEventListener('error', (error) => {
                console.error('FMP WebSocket error:', error);
                this.isConnecting = false;
            });

            this.socket.addEventListener('close', () => {
                console.log('FMP WebSocket connection closed');
                this.isConnecting = false;
                this.isAuthenticated = false;
                this.socket = null;
                this.attemptReconnect();
            });
        } catch (error) {
            console.error('Error creating FMP WebSocket:', error);
            this.isConnecting = false;
            this.attemptReconnect();
        }
    }

    private authenticate() {
        if (this.socket?.readyState === WebSocket.OPEN) {
            const loginMessage = JSON.stringify({
                event: 'login',
                data: { apiKey: FMP_API_KEY }
            });
            this.socket.send(loginMessage);
            console.log('Sent FMP authentication request');
        }
    }

    private handlePriceMessage(msg: FMPWebSocketMessage) {
        const symbol = msg.s;
        if (!symbol) return;

        const existingData = this.priceData.get(symbol);
        const previousPrice = existingData?.price || msg.lp || 0;
        const currentPrice = msg.lp || previousPrice;
        const change = currentPrice - previousPrice;

        this.priceData.set(symbol, {
            symbol,
            price: currentPrice,
            change: existingData ? change : 0,
            bid: msg.bp,
            ask: msg.ap,
            volume: msg.ls,
            timestamp: msg.t,
        });

        // Notify all subscribers
        this.notifySubscribers();
    }

    private attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('FMP WebSocket: Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

        console.log(`FMP WebSocket: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        this.reconnectTimeout = setTimeout(() => {
            this.connect();
        }, delay);
    }

    private sendSubscribe(symbols: string[]) {
        if (this.socket?.readyState === WebSocket.OPEN && this.isAuthenticated) {
            const subscribeMessage = JSON.stringify({
                event: 'subscribe',
                data: { ticker: symbols }
            });
            this.socket.send(subscribeMessage);
            console.log(`FMP WebSocket: Subscribed to ${symbols.length} symbols`);
        }
    }

    private sendUnsubscribe(symbols: string[]) {
        if (this.socket?.readyState === WebSocket.OPEN && this.isAuthenticated) {
            const unsubscribeMessage = JSON.stringify({
                event: 'unsubscribe',
                data: { ticker: symbols }
            });
            this.socket.send(unsubscribeMessage);
            console.log(`FMP WebSocket: Unsubscribed from ${symbols.length} symbols`);
        }
    }

    subscribeToSymbols(symbols: string[]) {
        symbols.forEach(symbol => {
            this.subscribedSymbols.add(symbol.toUpperCase());
        });

        if (this.isAuthenticated) {
            this.sendSubscribe(symbols.map(s => s.toUpperCase()));
        }
    }

    unsubscribeFromSymbols(symbols: string[]) {
        symbols.forEach(symbol => {
            this.subscribedSymbols.delete(symbol.toUpperCase());
        });

        if (this.isAuthenticated) {
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
        this.subscribers.clear();
        this.reconnectAttempts = 0;
        this.isAuthenticated = false;
    }

    isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN && this.isAuthenticated;
    }
}

// Singleton instance
const fmpWS = new FMPWebSocketService();

export const initializeFMPWebSocket = (etfs: ETF[]) => {
    cachedETFs = etfs;
    fmpWS.connect();

    // Subscribe to all ETF symbols
    const symbols = etfs.map(etf => etf.symbol);
    fmpWS.subscribeToSymbols(symbols);
};

export const subscribeToFMPUpdates = (callback: (etfs: ETF[]) => void) => {
    return fmpWS.subscribe((priceUpdates) => {
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

export const updateFMPCachedETFs = (etfs: ETF[]) => {
    cachedETFs = etfs;
};

export const disconnectFMPWebSocket = () => {
    fmpWS.disconnect();
};

export const isFMPWebSocketConnected = () => {
    return fmpWS.isConnected();
};

export default fmpWS;
