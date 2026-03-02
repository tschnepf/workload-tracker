/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_OPENAPI_MIGRATION_ENABLED?: 'true' | 'false'
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
