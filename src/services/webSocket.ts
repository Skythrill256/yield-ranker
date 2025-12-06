/**
 * WebSocket Service Re-exports
 * 
 * Unified exports for real-time price streaming.
 * Uses Tiingo IEX WebSocket for realtime ETF prices.
 */

// Primary: Tiingo IEX WebSocket (real-time ETF prices)
export {
    initializeTiingoWebSocket as initializeWebSocket,
    subscribeToTiingoUpdates as subscribeToETFUpdates,
    updateTiingoCachedETFs as updateCachedETFs,
    disconnectTiingoWebSocket as disconnectWebSocket,
    isTiingoWebSocketConnected as isWebSocketConnected,
    default as webSocket,
} from './tiingoWebSocket';

// Direct Tiingo exports (for explicit usage)
export {
    initializeTiingoWebSocket,
    subscribeToTiingoUpdates,
    updateTiingoCachedETFs,
    disconnectTiingoWebSocket,
    isTiingoWebSocketConnected,
} from './tiingoWebSocket';
