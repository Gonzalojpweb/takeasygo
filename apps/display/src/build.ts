declare const __DISPLAY_BUILD__: { version: string; builtAt: string } | undefined

/** Versión de ESTE bundle (commit). En desarrollo y tests, 'dev'. */
export const CURRENT_BUILD: { version: string; builtAt: string } =
  typeof __DISPLAY_BUILD__ !== 'undefined' ? __DISPLAY_BUILD__ : { version: 'dev', builtAt: '' }
