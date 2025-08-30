/**
 * Lighthouse CI Configuration - Phase 6 Implementation
 * Performance budgets and automated CI monitoring
 */

module.exports = {
  ci: {
    collect: {
      // URLs to audit (can be expanded for different pages)
      url: [
        'http://localhost:3000',
        'http://localhost:3000/dashboard',
        'http://localhost:3000/people',
        'http://localhost:3000/projects',
        'http://localhost:3000/assignments',
        'http://localhost:3000/performance',
      ],
      
      // Collect settings
      numberOfRuns: 3, // Run 3 times and average results
      startServerCommand: 'docker-compose up -d', // Start services before audit
      startServerReadyPattern: 'webpack compiled', // Wait for this pattern
      startServerTimeout: 60000, // 60 second timeout
      
      // Chromium settings for consistent results
      settings: {
        chromeFlags: '--no-sandbox --disable-dev-shm-usage --headless',
        preset: 'desktop', // Use desktop preset for consistent metrics
        throttlingMethod: 'simulate', // Simulate throttling for faster runs
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 4,
        },
      },
    },
    
    // Performance budgets aligned with our monitoring thresholds
    assert: {
      assertions: {
        // Core Web Vitals budgets (aligned with PERFORMANCE_BUDGETS - 2024/2025 standards)
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }], // LCP budget
        'first-contentful-paint': ['error', { maxNumericValue: 1800 }],   // FCP budget
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],   // CLS budget
        'total-blocking-time': ['error', { maxNumericValue: 200 }],       // TBT approximates INP (replaces FID)
        
        // Performance score thresholds
        'categories:performance': ['error', { minScore: 0.8 }], // 80+ performance score
        'categories:accessibility': ['error', { minScore: 0.95 }], // 95+ accessibility score
        'categories:best-practices': ['error', { minScore: 0.9 }], // 90+ best practices score
        'categories:seo': ['error', { minScore: 0.9 }], // 90+ SEO score
        
        // Resource budgets
        'resource-summary:script:size': ['warn', { maxNumericValue: 1000000 }], // 1MB JS budget
        'resource-summary:total:size': ['warn', { maxNumericValue: 3000000 }],  // 3MB total budget
        'resource-summary:total:count': ['warn', { maxNumericValue: 100 }],     // 100 resource limit
        
        // Network efficiency
        'unused-css-rules': ['warn', { maxNumericValue: 50000 }], // 50KB unused CSS
        'unused-javascript': ['warn', { maxNumericValue: 100000 }], // 100KB unused JS
        'render-blocking-resources': ['warn', { maxNumericValue: 500 }], // 500ms blocking time
        
        // Modern web standards
        'uses-webp-images': 'off', // We may not have WebP yet
        'uses-optimized-images': 'warn',
        'uses-text-compression': 'error',
        'uses-responsive-images': 'warn',
        
        // Security and best practices
        'is-on-https': 'off', // Development doesn't use HTTPS
        'redirects-http': 'off', // Development doesn't use HTTPS
        'uses-http2': 'off', // Development may not use HTTP/2
      },
    },
    
    // Upload results to temporary server (can be configured for persistent storage)
    upload: {
      target: 'temporary-public-storage',
      // For production, consider using:
      // target: 'lhci',
      // serverBaseUrl: 'https://your-lhci-server.com',
      // token: process.env.LHCI_TOKEN,
    },
    
    // Server configuration (if running LHCI server)
    server: {
      port: 9001,
      storage: {
        storageMethod: 'sql',
        sqlDialect: 'sqlite3',
        sqlDatabasePath: './lhci.db',
      },
    },
  },
};