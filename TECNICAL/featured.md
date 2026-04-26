# Inventario de Funcionalidades por Modelo de Negocio

Este documento detalla la segmentación de características y límites operativos de TakeasyGO según el plan asignado al tenant.

---

## 📊 Matriz de Acceso Rápido

| Feature | Trial | Anfitrión | Inicial | Crecimiento | Premium |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Menú Digital** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Pedidos / Orders** | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Historial de Pedidos** | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Configuración / Settings** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Club de Fidelización** | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Impresoras en Cocina** | 1 | ❌ | 1 | Múltiples | Múltiples |
| **Sedes / Locations** | 1 | 1 | 1 | Múltiples | Múltiples |
| **Reportes de Ventas** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Gestión de Usuarios** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Log de Auditoría** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **ICO Operativo** | ✅* | ❌ | ❌ | ✅ | ✅ |
| **Integración POS** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Reservas** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Dine-In (Salón)** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Advanced Analytics** | ❌ | ❌ | ❌ | ❌ | ✅ |

*\*El plan Trial solo incluye el reporte ICO básico al finalizar los 30 pedidos de prueba.*

---

## 💎 Detalle por Plan

### 1. Trial (Prueba Gratuita)
**Objetivo:** Permitir al restaurante probar la plataforma sin compromiso.
- **Límite de Pedidos:** 30 pedidos totales.
- **Sedes:** Máximo 1 ubicación.
- **Impresoras:** Máximo 1 impresora configurada.
- **Club de Fidelización:** Máximo 30 miembros.
- **ICO:** Genera un diagnóstico de contexto operativo al alcanzar el límite de 30 pedidos.
- **Exclusiones:** No incluye reportes, gestión de equipo, ni integraciones POS.

### 2. Anfitrión (Acceso de Lanzamiento)
**Objetivo:** Acceso exclusivo para "Early Adopters" con foco en visibilidad (menú digital).
- **Funcionalidad Principal:** Menú digital autogestionable y branding.
- **Restricción Crítica:** **No permite recibir pedidos online.** El carrito está desactivado.
- **Club de Fidelización:** Desactivado (0 miembros).

### 3. Inicial (try)
**Objetivo:** Restaurantes que buscan digitalizar su toma de pedidos de forma simple.
- **Pedidos:** Ilimitados.
- **Sedes:** Máximo 1 ubicación.
- **Impresoras:** Máximo 1 impresora configurada.
- **Club de Fidelización:** Hasta 150 miembros. No permite exportar la lista de clientes.
- **Branding:** Personalización básica de colores y logo.

### 4. Crecimiento (buy)
**Objetivo:** Restaurantes con operación consolidada y múltiples puntos de venta.
- **Sedes:** Multisede habilitado.
- **Usuarios:** Gestión de equipo con roles (Staff, Cajero, Gerente, Admin).
- **Impresoras:** Soporte para múltiples impresoras por local (Despacho segmentado).
- **Reportes:** Dashboard de ventas con comparativa mensual (MoM) y exportación PDF/Excel.
- **ICO:** Acceso al Score de Fiabilidad Operativa detallado.
- **Integraciones:** Módulo de **Integración POS** (FUDO / BISTROSOFT / API Keys).
- **Reservas:** Gestión de reservaciones con pago de seña opcional.
- **Club de Fidelización:** Miembros ilimitados y exportación de base de datos.
- **Auditoría:** Registro de acciones administrativas para seguridad.

### 5. Premium (full)
**Objetivo:** Optimización total basada en datos y diagnóstico avanzado.
- **Advanced Analytics:** Tasa de recompra, frecuencia de clientes (últimos 90 días), distribución horaria y detección de hora pico.
- **ICO Avanzado:** Diagnóstico completo por factores (TPP, cumplimiento de tiempos, tasa de cancelación con tendencia).
- **Conversión:** Seguimiento de tasa de conversión de pagos MercadoPago.
- **Loyalty Analytics:** Métricas avanzadas de engagement del club de fidelización.

---

## 🛠️ Aspectos Técnicos de Segmentación

La lógica de control se encuentra centralizada en:
- `lib/plans.ts`: Define las constantes `PLAN_ACCESS`, `PLAN_LABELS` y los helpers `canAccess()`.
- `components/admin/AdminSidebar.tsx`: Gestiona el bloqueo visual y funcional de los ítems de navegación según el plan del tenant.
- `middleware.ts`: (Si aplica) Validaciones de ruta a nivel servidor.
