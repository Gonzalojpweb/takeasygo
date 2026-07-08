/// <reference types="vite/client" />

interface ImportMetaEnv {
  VITE_SAAS_URL?: string;
  VITE_SYNC_URL?: string;
  // add other env vars as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
