---
modulo: adminPushNotifications
tipo: opcional
roles: [admin, manager]
version_doc: "2026-10-27"
---
# Notificaciones Push al Admin

## Qué es y para qué sirve
El módulo de Notificaciones Push envía alertas al dispositivo del admin cuando llega un pedido nuevo, se agota stock, o ocurren eventos importantes. Permite responder rápidamente sin estar frente a la pantalla.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Recibir notificaciones push, configurar tipos de alerta. | — |
| **manager** | Recibir notificaciones (si está configurado). | Configurar tipos de alerta (en algunos casos). |
| **cashier** | — | Recibir notificaciones push al admin (no aplica). |
| **waiter** | — | Recibir notificaciones push al admin. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `trial`, `buy`, `full` (no disponible en `try`, `anfitrion`).
- **Rol mínimo**: `admin` (configuración) o `manager` (recepción).
- Se activa en Configuración → Notificaciones → Push notifications.

## Paso a paso de las tareas principales

### Activar notificaciones push (solo admin)
1. Ir a **Configuración → Notificaciones**.
2. Activar **"Push notifications"**.
3. Seleccionar **tipos de alerta**:
   - Nuevo pedido.
   - Stock bajo.
   - Cierre de caja.
   - Errores de sistema.
4. Clic en **"Guardar"**.
5. Aceptar permiso de notificaciones en el dispositivo.

### Recibir notificaciones
1. Con notificaciones activadas en configuración.
2. Dispositivo conectado a internet.
3. Al llegar evento (ej. nuevo pedido), llega notificación push.
4. Tocar notificación para abrir detalle.

### Configurar tipos de alerta (solo admin)
1. Ir a **Configuración → Notificaciones**.
2. Marcar/desmarcar tipos de alerta.
3. Clic en **"Guardar"**.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Activar/Desactivar** | Habilita o deshabilita notificaciones push. |
| **Nuevo pedido** | Alerta cuando llega orden online/presencial. |
| **Stock bajo** | Alerta cuando insumo bajo mínimo. |
| **Cierre de caja** | Recordatorio de cierre de turno. |
| **Errores** | Alerta de errores del sistema. |

## Reglas de negocio y límites

- **Plan trial/buy/full**: No disponible en try, anfitrion.
- **Dispositivo conectado**: Requiere conexión a internet.
- **Permisos del navegador**: El usuario debe aceptar notificaciones.
- **Solo admin/manager**: Los roles operativos no reciben estas alertas.
- **Multi-tenant**: Notificaciones del propio negocio.

## Relación con otros módulos

- **orders**: Nuevos pedidos generan notificación.
- **inventory**: Stock bajo genera notificación.
- **settings**: Configuración de notificaciones.
- **cash-register**: Cierre de caja genera recordatorio.

## Preguntas frecuentes

1. **¿Cómo activo notificaciones push?**
   → Configuración → Notificaciones → activar Push → guardar → aceptar en dispositivo.

2. **¿Qué alertas puedo recibir?**
   → Nuevos pedidos, stock bajo, cierre de caja, errores.

3. **¿Solo el admin recibe notificaciones?**
   → Sí, las push al admin son para rol admin/manager.

4. **¿Puedo desactivar temporalmente?**
   → Sí, en Configuración → Notificaciones → desactivar.

5. **¿Por qué no me llegan?**
   → Verificar activadas en configuración, permisos del navegador, conexión a internet.

6. **¿Puedo elegir qué alertas recibir?**
   → Sí, marcar/desmarcar tipos en configuración.

7. **¿Llegan al celular?**
   → Sí, si accedes desde dispositivo móvil y aceptas notificaciones.

8. **¿Está disponible en mi plan?**
   → trial, buy, full. No en try ni anfitrion.

9. **¿Los cajeros reciben estas notificaciones?**
   → No, son exclusivas para admin/manager.

10. **¿Puedo cambiar el sonido?**
    → Depende del sistema operativo del dispositivo.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Push notifications not available in your plan` | Plan try/anfitrion. | Cambiar de plan. |
| `Notifications disabled in browser` | Permiso denegado. | Aceptar notificaciones en navegador. |
| `Device not connected` | Sin conexión. | Verificar internet. |
| `Insufficient permissions` | Rol no admin. | Pedir al admin que configure. |

## Recomendaciones y buenas prácticas

- **Mantener dispositivo conectado**: Para recibir alertas tiempo real.
- **Revisar configuración**: Asegurar tipos de alerta correctos.
- **No desactivar por error**: Verificar antes de desactivar.
- **Usar en dispositivos dedicados**: Un celular/tablet siempre encendido.
- **Probar notificaciones**: Verificar que lleguen después de configurar.

## Qué hacer si no funcionan

Si no llegan notificaciones:
1. Verificar plan (trial/buy/full).
2. Verificar activadas en configuración.
3. Verificar permisos del navegador.
4. Verificar conexión a internet.
5. Probar con nuevo pedido.
6. Si persiste, contactar soporte con: negocio, plan, dispositivo, error.

## Descripción breve para negocios que NO lo tienen activo

El módulo de Notificaciones Push envía alertas al dispositivo del admin cuando llegan pedidos nuevos, se agota stock, o ocurren eventos importantes. Permite responder rápidamente sin estar frente a la pantalla. Disponible en planes trial, buy y full.