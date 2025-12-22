import { useLocation } from "react-router-dom";

/**
 * Get the current category based on the route
 * @returns "cef" for Closed End Funds, "cc" for Covered Call Option ETFs
 */
export const getCurrentCategory = (pathname: string): "cef" | "cc" => {
  // Check resources routes first
  if (pathname === "/resources-cef") {
    return "cef";
  }
  if (pathname === "/resources-cc") {
    return "cc";
  }
  // Check CEF routes
  if (pathname.startsWith("/cef")) {
    return "cef";
  }
  // Default to CC if on home page or CC pages
  return "cc";
};

/**
 * Hook to get current category
 */
export const useCategory = (): "cef" | "cc" => {
  const location = useLocation();
  return getCurrentCategory(location.pathname);
};

