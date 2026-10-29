// swagger-ui-dist trae el bundle UMD sin tipos propios por subruta.
declare module 'swagger-ui-dist/swagger-ui-bundle.js' {
  const SwaggerUIBundle: (options: Record<string, unknown>) => unknown
  export default SwaggerUIBundle
}
