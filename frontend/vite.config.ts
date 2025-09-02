import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import path from 'path'
import pkg from './package.json'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Bundle analyzer - only in build mode
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
    // Sentry source maps upload - production only
    process.env.NODE_ENV === 'production' && sentryVitePlugin({
      org: process.env.VITE_SENTRY_ORG,
      project: process.env.VITE_SENTRY_PROJECT,
      authToken: process.env.VITE_SENTRY_AUTH_TOKEN,
    }),
  ].filter(Boolean),
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.VITE_APP_VERSION || (pkg as any).version || 'dev'),
  },
  build: {
    // Target modern browsers for smaller bundles
    target: 'es2020',
    
    // Generate sourcemaps for debugging
    sourcemap: true,
    
    // Optimize chunk size warnings
    chunkSizeWarningLimit: 1000,
    
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks: {
          // React core
          'react-vendor': ['react', 'react-dom'],
          
          // React Router
          'router': ['react-router-dom'],
          
          // React Query for data fetching
          'query': ['@tanstack/react-query', '@tanstack/react-query-devtools'],
        },
        
        // Generate hashed filenames for cache busting
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: (assetInfo) => {
          // Organize assets by type
          const info = assetInfo.name!.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/img/[name].[hash][extname]`;
          }
          if (/css/i.test(ext)) {
            return `assets/css/[name].[hash][extname]`;
          }
          return `assets/[name].[hash][extname]`;
        },
      },
    },
    
    // Enable CSS code splitting
    cssCodeSplit: true,
    
    // Minify for production
    minify: 'esbuild',
    
    // Optimize dependencies
    assetsInlineLimit: 4096, // Inline assets smaller than 4KB
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react', 
      'react-dom', 
      'react-router-dom',
      '@tanstack/react-query',
    ],
  },
})
