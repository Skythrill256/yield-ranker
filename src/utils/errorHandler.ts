/**
 * Global error handler for unhandled promise rejections and errors
 * Prevents white page crashes from module loading failures
 */

export function setupGlobalErrorHandlers() {
  // Handle unhandled promise rejections (like failed module imports)
  window.addEventListener("unhandledrejection", (event) => {
    const error = event.reason;
    
    // Check if it's a module loading error
    const isModuleError =
      error?.message?.includes("Failed to fetch dynamically imported module") ||
      error?.message?.includes("Failed to load module script") ||
      error?.message?.includes("MIME type") ||
      error?.name === "ChunkLoadError" ||
      (error?.message && typeof error.message === "string" && 
       error.message.includes("Expected a JavaScript-or-Wasm module script"));

    if (isModuleError) {
      console.error("[Global Error Handler] Module loading error detected:", error);
      
      // Prevent default error handling
      event.preventDefault();
      
      // Show user-friendly message and offer reload
      const shouldReload = window.confirm(
        "A required module failed to load. This usually happens after a deployment.\n\n" +
        "Would you like to reload the page to get the latest version?"
      );
      
      if (shouldReload) {
        // Clear cache and reload
        if ("caches" in window) {
          caches.keys().then((names) => {
            names.forEach((name) => {
              caches.delete(name);
            });
          });
        }
        window.location.reload();
      }
    } else {
      // Log other errors but don't prevent default handling
      console.error("[Global Error Handler] Unhandled promise rejection:", error);
    }
  });

  // Handle general errors
  window.addEventListener("error", (event) => {
    const error = event.error;
    
    // Check if it's a module loading error
    const isModuleError =
      error?.message?.includes("Failed to fetch dynamically imported module") ||
      error?.message?.includes("Failed to load module script") ||
      error?.message?.includes("MIME type") ||
      error?.name === "ChunkLoadError" ||
      (error?.message && typeof error.message === "string" && 
       error.message.includes("Expected a JavaScript-or-Wasm module script"));

    if (isModuleError) {
      console.error("[Global Error Handler] Module loading error detected:", error);
      event.preventDefault();
    }
  });
}

