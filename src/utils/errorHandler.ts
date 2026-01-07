/**
 * Global error handler for unhandled promise rejections and errors
 * Prevents white page crashes from module loading failures
 */

// Custom event for showing error dialogs from outside React
export const ERROR_DIALOG_EVENT = 'showErrorDialog';

interface ErrorDialogData {
  title: string;
  message: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  onResume?: () => void;
  showResume?: boolean;
}

// Save current app state to localStorage
function saveAppState() {
  try {
    const state = {
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      timestamp: Date.now(),
      scrollY: window.scrollY,
    };
    localStorage.setItem('app_recovery_state', JSON.stringify(state));
  } catch (e) {
    console.warn('[Error Handler] Failed to save app state:', e);
  }
}

// Restore app state from localStorage
export function restoreAppState(): boolean {
  try {
    const saved = localStorage.getItem('app_recovery_state');
    if (!saved) return false;
    
    const state = JSON.parse(saved);
    const age = Date.now() - (state.timestamp || 0);
    
    // Only restore if state is less than 5 minutes old
    if (age > 5 * 60 * 1000) {
      localStorage.removeItem('app_recovery_state');
      return false;
    }
    
    // Restore scroll position after navigation
    if (state.scrollY) {
      setTimeout(() => {
        window.scrollTo(0, state.scrollY);
      }, 100);
    }
    
    return true;
  } catch (e) {
    console.warn('[Error Handler] Failed to restore app state:', e);
    return false;
  }
}

// Save state periodically and before navigation
let saveInterval: number | null = null;

function startStateSaving() {
  // Save state every 10 seconds
  saveInterval = window.setInterval(() => {
    saveAppState();
  }, 10000);
  
  // Save state before page unload
  window.addEventListener('beforeunload', saveAppState);
  
  // Save state on navigation
  window.addEventListener('popstate', saveAppState);
}

function stopStateSaving() {
  if (saveInterval !== null) {
    clearInterval(saveInterval);
    saveInterval = null;
  }
  window.removeEventListener('beforeunload', saveAppState);
  window.removeEventListener('popstate', saveAppState);
}

export function showErrorDialog(data: ErrorDialogData) {
  window.dispatchEvent(
    new CustomEvent(ERROR_DIALOG_EVENT, { detail: data })
  );
}

// Retry failed module loads
async function retryModuleLoad(maxRetries = 3, delay = 1000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Attempt to reload the page
      await new Promise(resolve => setTimeout(resolve, delay));
      return true;
    } catch (e) {
      console.warn(`[Error Handler] Retry attempt ${i + 1} failed:`, e);
      if (i === maxRetries - 1) return false;
    }
  }
  return false;
}

function isModuleOrNetworkError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error?.message || '';
  const errorName = error?.name || '';
  
  // Check for various types of loading errors
  return (
    errorMessage.includes("Failed to fetch dynamically imported module") ||
    errorMessage.includes("Failed to load module script") ||
    errorMessage.includes("MIME type") ||
    errorMessage.includes("Failed to fetch") ||
    errorMessage.includes("NetworkError") ||
    errorMessage.includes("Load failed") ||
    errorMessage.includes("Loading chunk") ||
    errorMessage.includes("ChunkLoadError") ||
    errorMessage.includes("Loading CSS chunk") ||
    errorName === "ChunkLoadError" ||
    errorName === "NetworkError" ||
    errorName === "TypeError" && errorMessage.includes("fetch") ||
    (typeof errorMessage === "string" && 
     errorMessage.includes("Expected a JavaScript-or-Wasm module script")) ||
    // Network errors
    (error?.status !== undefined && error.status >= 400) ||
    // CORS or network issues
    (errorMessage.includes("CORS") || errorMessage.includes("network"))
  );
}

export function setupGlobalErrorHandlers() {
  // Start saving app state
  startStateSaving();
  
  // Save state before any navigation or error
  saveAppState();

  // Handle unhandled promise rejections (like failed module imports)
  window.addEventListener("unhandledrejection", (event) => {
    const error = event.reason;
    
    // Check if it's a module or network loading error
    const isError = isModuleOrNetworkError(error);

    if (isError) {
      console.error("[Global Error Handler] Loading error detected:", error);
      
      // Prevent default error handling
      event.preventDefault();
      
      // Save state before showing error
      saveAppState();
      
      // Show user-friendly dialog via custom event with resume option
      showErrorDialog({
        title: "Page Loading Error",
        message: "A required resource failed to load. This can happen due to network issues or after a deployment.\n\nWould you like to:\n• Reload the page (recommended)\n• Try to resume where you were\n• Continue anyway",
        onConfirm: () => {
          // Clear cache and reload
          stopStateSaving();
          if ("caches" in window) {
            caches.keys().then((names) => {
              names.forEach((name) => {
                caches.delete(name);
              });
              setTimeout(() => window.location.reload(), 500);
            }).catch(() => {
              window.location.reload();
            });
          } else {
            window.location.reload();
          }
        },
        onResume: () => {
          // Try to restore state and continue
          const restored = restoreAppState();
          console.log("[Global Error Handler] Attempting to resume:", restored);
          // Don't reload, just let the app continue
        },
        onCancel: () => {
          // User wants to continue anyway
          console.warn("[Global Error Handler] User chose to continue");
        },
        showResume: true,
      });
    } else {
      // Log other errors but don't prevent default handling
      console.error("[Global Error Handler] Unhandled promise rejection:", error);
    }
  });

  // Handle general errors (including script loading errors)
  window.addEventListener("error", (event) => {
    const error = event.error || event;
    
    // Check if it's a module or network loading error
    const isError = isModuleOrNetworkError(error) || 
                    event.message?.includes("Loading chunk") ||
                    event.message?.includes("ChunkLoadError") ||
                    (event.target && (event.target as any).tagName === "SCRIPT");

    if (isError && !event.error) {
      // Script tag loading error
      console.error("[Global Error Handler] Script loading error detected:", event.message);
      event.preventDefault();
      
      // Save state before showing error
      saveAppState();
      
      showErrorDialog({
        title: "Script Loading Error",
        message: "A script failed to load. This often happens after a deployment.\n\nWould you like to reload the page to get the latest version?",
        onConfirm: () => {
          stopStateSaving();
          if ("caches" in window) {
            caches.keys().then((names) => {
              names.forEach((name) => {
                caches.delete(name);
              });
              setTimeout(() => window.location.reload(), 500);
            }).catch(() => {
              window.location.reload();
            });
          } else {
            window.location.reload();
          }
        },
        onResume: () => {
          restoreAppState();
        },
        showResume: true,
      });
    } else if (isModuleOrNetworkError(error)) {
      console.error("[Global Error Handler] Error detected:", error);
      event.preventDefault();
      saveAppState();
    }
  }, true); // Use capture phase to catch all errors

  // Handle network offline/online events
  window.addEventListener("online", () => {
    console.log("[Global Error Handler] Network back online");
    // Try to restore state if we had an error
    restoreAppState();
  });

  window.addEventListener("offline", () => {
    console.warn("[Global Error Handler] Network went offline");
    saveAppState();
  });
}

