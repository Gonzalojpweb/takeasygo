# Arquitectura de Pagos Seguros (Mercado Pago)

Este documento detalla la implementación técnica diseñada para eliminar los "pagos fantasma" y garantizar la integridad de las transacciones entre Takeasygo y Mercado Pago.

## Desafío Técnico
En una integración de pagos distribuida, el sistema puede fallar si la notificación (Webhook) se pierde, el servidor está caído durante el evento, o hay errores de concurrencia. El objetivo es que **cada centavo debitado al cliente resulte en una orden confirmada en el sistema.**

## Soluciones Implementadas

### 1. Capa de Idempotencia y Auditoría (`PaymentNotification`)
Se creó un modelo de datos dedicado (`models/PaymentNotification.ts`) que registra cada evento entrante.
- **Idempotencia:** Antes de procesar un pago, el sistema verifica si el `mpId` ya fue procesado exitosamente. Esto evita que reintentos de Mercado Pago dupliquen lógica de negocio (como impresiones de tickets o descuentos de stock).
- **Audit Trail:** Cada JSON recibido se guarda para diagnóstico técnico en caso de disputas o errores.

### 2. Transacciones ACID (Atómicas) en Webhooks
El manejador de notificaciones (`app/api/webhooks/mercadopago/[tenant]/route.ts`) fue refactorizado para usar **Transacciones de MongoDB**.
- **Atomismo:** El registro de la notificación, la actualización del estado de la orden y el cambio de estado de la reserva ocurren como una única unidad de trabajo.
- **Seguridad:** Si el servidor falla o la DB se desconecta a mitad del proceso, **todos** los cambios se revierten (Rollback), evitando estados inconsistentes (ej: orden pagada pero no confirmada).

### 3. Mecanismo de Reconciliación "Self-Healing"
Se implementó un endpoint de autocuración proactiva: `/api/[tenant]/payments/reconcile`.
- **Lógica:** En lugar de esperar pasivamente el Webhook (Push), el sistema busca órdenes "Pendientes" de las últimas 24 horas y le pregunta a la API de Mercado Pago (Pull) por su estado real mediante el `external_reference`.
- **Uso:** Puede ser disparado por un Cron Job diario o manual desde el panel de administración para "rescatar" pagos que fallaron en la capa de Webhook.

---

## Estructura de Archivos
- `models/PaymentNotification.ts`: Definición del modelo de auditoría.
- `app/api/webhooks/mercadopago/[tenant]/route.ts`: Lógica transaccional de recepción de pagos.
- `app/api/[tenant]/payments/reconcile/route.ts`: Motor de reconciliación proactiva.

## Verificación de Integridad
Para probar la robustez de esta implementación:
1. **Simulación de Corte:** Interrumpir el proceso del webhook antes del `commit` de la transacción. Verificar que la orden NO cambie a `confirmed`.
2. **Prueba de Reconciliación:** Crear una orden, pagar en sandbox, pero bloquear el endpoint de webhook. Luego ejecutar `/reconcile` y verificar que la orden se confirme automáticamente.

> [!IMPORTANT]
> Esta arquitectura requiere que MongoDB esté configurado como un **Replica Set** (estándar en MongoDB Atlas) para soportar transiciones ACID.

---
*Takeasygo Technical Documentation - 2026*
