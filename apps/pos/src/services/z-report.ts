// ============================================================================
// Z Report Generator — módulo movido al monorepo
// ============================================================================
// El generador vive ahora en `@takeasygo/business/z-report` para que
// apps/saas calcule EXACTAMENTE el mismo reporte al cerrar la caja en
// /api/[tenant]/pos/* (Regla: el Z es un único snapshot, no dos versiones).
//
// Este archivo queda como re-export para no romper los imports existentes
// (services/cash.ts y __tests__/z-report.test.ts).
// ============================================================================
export { generateZReport, type ZReportInput } from "@takeasygo/business/browser"
