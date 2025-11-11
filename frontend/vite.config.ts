import { defineConfig, loadEnv } from 'vite'
import fs from 'fs'
import path from 'path'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import path from 'path'
import pkg from './package.json'

// https://vitejs.dev/config/
const SHOULD_UPLOAD_SOURCEMAPS = process.env.SENTRY_UPLOAD === 'true';
const RELEASE = process.env.VITE_APP_VERSION || (pkg as any).version || 'dev';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Try to read HOST_IP from repo root .env as a fallback when running outside Docker
  let hostFromParentEnv: string | undefined
  try {
    const parentEnvPath = path.resolve(__dirname, '../.env')
    if (fs.existsSync(parentEnvPath)) {
      const content = fs.readFileSync(parentEnvPath, 'utf-8')
      const m = content.match(/^HOST_IP\s*=\s*([^\r\n#]+)/m)
      if (m && m[1]) hostFromParentEnv = m[1].trim()
    }
  } catch {}
  // Preferred order for backend target in dev:
  // 1) VITE_PROXY_TARGET (explicit override)
  // 2) HOST_IP from root .env (common in this repo)
  // 3) Docker service DNS name (backend)
  const DEV_PROXY_TARGET = env.VITE_PROXY_TARGET || (env.HOST_IP ? `http://${env.HOST_IP}:8000` : (hostFromParentEnv ? `http://${hostFromParentEnv}:8000` : 'http://backend:8000'))

  return {
  plugins: [
    react(),
    // Bundle analyzer - only in build mode
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
    // Sentry source maps upload - CI/production only when explicitly enabled
    process.env.NODE_ENV === 'production' && SHOULD_UPLOAD_SOURCEMAPS && sentryVitePlugin({
      org: process.env.VITE_SENTRY_ORG,
      project: process.env.VITE_SENTRY_PROJECT,
      authToken: process.env.VITE_SENTRY_AUTH_TOKEN,
      telemetry: false,
      release: {
        name: RELEASE,
      },
    }),
  ].filter(Boolean),
  server: {
    host: '0.0.0.0',
    port: 3000,
    // Avoid watching heavy backup/vendor folders that can hang dev server on startup
    watch: {
      ignored: [
        '**/node_modules-bak/**',
        '**/dist/**',
        '**/.next/**',
        '**/.cache/**',
        '**/coverage/**',
        '**/playwright-report/**',
      ],
    },
    // Dev proxy to backend to avoid cross-origin and host port issues on Windows
    proxy: {
      '/api': {
        target: DEV_PROXY_TARGET,
        changeOrigin: true,
        secure: false,
      },
      // Proxy public calendar feeds to Django (so the SPA doesn't intercept them)
      '/calendar': {
        target: DEV_PROXY_TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
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
    
    // Generate sourcemaps only when uploading to Sentry (CI)
    sourcemap: SHOULD_UPLOAD_SOURCEMAPS,
    
    // Optimize chunk size warnings
    chunkSizeWarningLimit: 1000,
    
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks: {
          // React core
          'react-vendor': ['react', 'react-dom'],
          
          // React Router
          'router': ['react-router'],
          
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
      'react-router',
      '@tanstack/react-query',
    ],
  },
  }
})
