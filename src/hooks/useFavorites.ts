import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const FAVORITES_STORAGE_KEY = 'yield-ranker-favorites';

export function useFavorites() {
  const { user } = useAuth();
  const storageKey = user ? `${FAVORITES_STORAGE_KEY}-${user.id}` : FAVORITES_STORAGE_KEY;
  
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return new Set(Array.isArray(parsed) ? parsed : []);
      }
    } catch (error) {
      console.error('Failed to load favorites from localStorage:', error);
    }
    return new Set();
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setFavorites(new Set(Array.isArray(parsed) ? parsed : []));
      }
    } catch (error) {
      console.error('Failed to load favorites from localStorage:', error);
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(favorites)));
    } catch (error) {
      console.error('Failed to save favorites to localStorage:', error);
    }
  }, [favorites, storageKey]);

  const toggleFavorite = (symbol: string) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      const normalizedSymbol = symbol.toUpperCase();
      
      let found = false;
      let existingSymbol = '';
      for (const fav of newFavorites) {
        if (fav.toUpperCase() === normalizedSymbol) {
          found = true;
          existingSymbol = fav;
          break;
        }
      }
      
      if (found) {
        newFavorites.delete(existingSymbol);
      } else {
        newFavorites.add(symbol);
      }
      return newFavorites;
    });
  };

  const isFavorite = (symbol: string) => {
    const normalizedSymbol = symbol.toUpperCase();
    for (const fav of favorites) {
      if (fav.toUpperCase() === normalizedSymbol) {
        return true;
      }
    }
    return false;
  };

  /**
   * Clean up favorites by removing symbols that no longer exist in the ETF data
   * This should be called when ETF data is loaded to ensure favorites only contain valid symbols
   * Also normalizes favorites to match the exact symbol format from the data
   */
  const cleanupFavorites = (validSymbols: string[]) => {
    // Only cleanup if we have valid symbols - don't remove all favorites if ETF data is empty
    if (!validSymbols || validSymbols.length === 0) {
      return;
    }

    const validMap = new Map<string, string>();
    validSymbols.forEach(s => {
      const upper = s.toUpperCase();
      validMap.set(upper, s);
    });
    
    setFavorites(prev => {
      const cleaned = new Set<string>();
      let hasChanges = false;
      
      prev.forEach(favSymbol => {
        const upperFav = favSymbol.toUpperCase();
        const matchedSymbol = validMap.get(upperFav);
        if (matchedSymbol) {
          // Only normalize if the casing is different, otherwise keep original
          cleaned.add(favSymbol === matchedSymbol ? favSymbol : matchedSymbol);
        } else {
          // Symbol doesn't exist in valid list - this is intentional removal
          hasChanges = true;
        }
      });
      
      // Only update if we actually removed invalid symbols
      if (hasChanges) {
        return cleaned;
      }
      return prev;
    });
  };

  return {
    favorites,
    toggleFavorite,
    isFavorite,
    cleanupFavorites,
  };
}

