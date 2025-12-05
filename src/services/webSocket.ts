/**
 * WebSocket Service Re-exports
 * 
 * Unified exports for real-time price streaming.
 * Uses FMP WebSocket as primary, with Finnhub as reference/fallback.
 */

// Primary: FMP WebSocket (real-time ETF prices)
export {
    initializeFMPWebSocket as initializeWebSocket,
    subscribeToFMPUpdates as subscribeToETFUpdates,
    updateFMPCachedETFs as updateCachedETFs,
    disconnectFMPWebSocket as disconnectWebSocket,
    isFMPWebSocketConnected as isWebSocketConnected,
    default as webSocket,
} from './fmpWebSocket';

// Direct FMP exports (for explicit usage)
export {
    initializeFMPWebSocket,
    subscribeToFMPUpdates,
    updateFMPCachedETFs,
    disconnectFMPWebSocket,
    isFMPWebSocketConnected,
} from './fmpWebSocket';

// Legacy Finnhub exports (for backward compatibility)
export {
    initializeWebSocket as initializeFinnhubWebSocket,
    subscribeToETFUpdates as subscribeToFinnhubUpdates,
    updateCachedETFs as updateFinnhubCachedETFs,
    disconnectWebSocket as disconnectFinnhubWebSocket,
    isWebSocketConnected as isFinnhubConnected,
} from './finnhubWebSocket';
