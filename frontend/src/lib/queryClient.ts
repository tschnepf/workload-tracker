import { QueryClient } from '@tanstack/react-query';

// Create and configure React Query client with performance-optimized settings
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Optimize caching and request behavior
      staleTime: 30 * 1000, // Consider data fresh for 30 seconds
      gcTime: 5 * 60 * 1000, // Keep unused data in cache for 5 minutes (renamed from cacheTime)
      retry: 1, // Only retry failed requests once to avoid slow UX
      refetchOnWindowFocus: false, // Prevent unnecessary refetches on window focus
      refetchOnReconnect: true, // Refetch when connection is restored
      refetchOnMount: true, // Always refetch when component mounts
      // Network mode to handle offline scenarios
      networkMode: 'online',
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
      // Network mode for mutations
      networkMode: 'online',
    },
  },
});