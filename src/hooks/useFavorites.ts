import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const FAVORITES_STORAGE_KEY = 'yield-ranker-favorites';

export type FavoriteCategory = 'etf' | 'cef';

export function useFavorites(category: FavoriteCategory = 'etf') {
  const { user } = useAuth();
  const storageKey = user ? `${FAVORITES_STORAGE_KEY}-${user.id}-${category}` : `${FAVORITES_STORAGE_KEY}-${category}`;
  const isInitialLoad = useRef(true);
  const isSyncing = useRef(false);

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

  const syncToDatabase = useCallback(async (symbols: string[]) => {
    if (!user?.id) return;

    try {
      let query = supabase
        .from('favorites')
        .select('symbol')
        .eq('user_id', user.id);
      
      try {
        query = query.eq('category', category);
      } catch (e) {
        console.warn('Category column may not exist, syncing all favorites');
      }
      
      const { data: currentDbFavorites, error: queryError } = await query;
      
      if (queryError && (queryError.message?.includes('category') || queryError.code === '42703')) {
        console.warn('Category column does not exist, skipping category-specific sync');
        return;
      }

      const dbSymbols = currentDbFavorites ? new Set(currentDbFavorites.map(row => row.symbol)) : new Set<string>();
      const symbolsToAdd = symbols.filter(s => !dbSymbols.has(s));
      const symbolsToRemove = Array.from(dbSymbols).filter(s => !symbols.includes(s));

      if (symbolsToAdd.length > 0) {
        const favoritesToInsert = symbolsToAdd.map(symbol => ({
          user_id: user.id,
          symbol: symbol,
          category: category,
        }));

        const { error: insertError } = await supabase
          .from('favorites')
          .insert(favoritesToInsert);

        if (insertError) {
          console.error('Failed to add favorites to database:', insertError);
        }
      }

      if (symbolsToRemove.length > 0) {
        let deleteQuery = supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .in('symbol', symbolsToRemove);
        
        try {
          deleteQuery = deleteQuery.eq('category', category);
        } catch (e) {
          console.warn('Category column may not exist for delete');
        }
        
        const { error: deleteError } = await deleteQuery;

        if (deleteError) {
          console.error('Failed to remove favorites from database:', deleteError);
        }
      }
    } catch (error) {
      console.error('Failed to sync favorites to database:', error);
    }
  }, [user?.id, category]);

  useEffect(() => {
    const loadFavorites = async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;

      try {
        let dbFavorites: string[] = [];
        
        if (user?.id) {
          let query = supabase
            .from('favorites')
            .select('symbol')
            .eq('user_id', user.id);
          
          try {
            query = query.eq('category', category);
          } catch (e) {
            console.warn('Category column may not exist, using old favorites format');
          }
          
          const { data, error } = await query;
          
          if (error) {
            if (error.message?.includes('category') || error.code === '42703') {
              console.warn('Category column does not exist yet, loading all favorites');
              const { data: allData } = await supabase
                .from('favorites')
                .select('symbol')
                .eq('user_id', user.id);
              if (allData) {
                dbFavorites = allData.map(row => row.symbol);
              }
            } else {
              console.error('Failed to load favorites from database:', error);
            }
          } else if (data) {
            dbFavorites = data.map(row => row.symbol);
          }
        }

        if (user?.id) {
          if (dbFavorites.length > 0) {
            setFavorites(new Set(dbFavorites));
            localStorage.setItem(storageKey, JSON.stringify(dbFavorites));
          } else {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
              try {
                const parsed = JSON.parse(stored);
                const localFavorites = Array.isArray(parsed) ? parsed : [];
                if (localFavorites.length > 0) {
                  setFavorites(new Set(localFavorites));
                  await syncToDatabase(localFavorites);
                } else {
                  setFavorites(new Set());
                }
              } catch (e) {
                console.error('Failed to parse localStorage favorites:', e);
                setFavorites(new Set());
              }
            } else {
              setFavorites(new Set());
            }
          }
        } else {
          const stored = localStorage.getItem(storageKey);
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              const localFavorites = Array.isArray(parsed) ? parsed : [];
              setFavorites(new Set(localFavorites));
            } catch (e) {
              console.error('Failed to parse localStorage favorites:', e);
              setFavorites(new Set());
            }
          }
        }
      } catch (error) {
        console.error('Failed to load favorites:', error);
      } finally {
        isSyncing.current = false;
        isInitialLoad.current = false;
      }
    };

    loadFavorites();
  }, [user?.id, storageKey, syncToDatabase, category]);

  useEffect(() => {
    if (isInitialLoad.current || isSyncing.current) return;

    try {
      const favoritesArray = Array.from(favorites);
      localStorage.setItem(storageKey, JSON.stringify(favoritesArray));
      
      if (user?.id) {
        isSyncing.current = true;
        syncToDatabase(favoritesArray).finally(() => {
          isSyncing.current = false;
        });
      }
    } catch (error) {
      console.error('Failed to save favorites:', error);
      isSyncing.current = false;
    }
  }, [favorites, storageKey, user?.id, syncToDatabase]);

  const toggleFavorite = useCallback((symbol: string) => {
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
  }, []);

  const isFavorite = useCallback((symbol: string) => {
    const normalizedSymbol = symbol.toUpperCase();
    for (const fav of favorites) {
      if (fav.toUpperCase() === normalizedSymbol) {
        return true;
      }
    }
    return false;
  }, [favorites]);

  /**
   * Normalize favorites to match the exact symbol format from the data
   * This does NOT remove favorites - it only normalizes casing to match the data
   */
  const cleanupFavorites = useCallback((validSymbols: string[]) => {
    if (!validSymbols || validSymbols.length === 0) {
      return;
    }

    const validMap = new Map<string, string>();
    validSymbols.forEach(s => {
      const upper = s.toUpperCase();
      validMap.set(upper, s);
    });

    setFavorites(prev => {
      const newFavorites = new Set<string>();
      prev.forEach(fav => {
        const upper = fav.toUpperCase();
        if (validMap.has(upper)) {
          newFavorites.add(validMap.get(upper)!);
        }
      });
      return newFavorites;
    });

    setFavorites(prev => {
      const normalized = new Set<string>();
      let hasChanges = false;

      prev.forEach(favSymbol => {
        const upperFav = favSymbol.toUpperCase();
        const matchedSymbol = validMap.get(upperFav);
        if (matchedSymbol) {
          if (favSymbol !== matchedSymbol) {
            normalized.add(matchedSymbol);
            hasChanges = true;
          } else {
            normalized.add(favSymbol);
          }
        } else {
          normalized.add(favSymbol);
        }
      });

      return hasChanges ? normalized : prev;
    });
  }, []);

  return useMemo(() => ({
    favorites,
    toggleFavorite,
    isFavorite,
    cleanupFavorites,
  }), [favorites, toggleFavorite, isFavorite, cleanupFavorites]);
}
