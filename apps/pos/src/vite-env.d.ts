/// <reference types="vite/client" />

/** Versión de este build (commit y fecha), la inyecta vite.config.ts. */
declare const __POS_BUILD__: { version: string; builtAt: string }

interface ImportMetaEnv {
  VITE_SAAS_URL?: string;
  VITE_SYNC_URL?: string;
  // add other env vars as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
