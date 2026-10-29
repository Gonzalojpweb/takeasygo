---
modulo: posIntegration
tipo: opcional
roles: [admin, manager]
version_doc: "2026-10-27"
---
# Integración POS

## Qué es y para qué sirve
El módulo de Integración POS permite conectar TakEasyGo con sistemas de punto de venta externos como Fudo, Bistrosoft o APIs propias. Sincroniza productos, precios y ventas entre TakEasyGo y el sistema de caja existente del restaurante.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Configurar integración, mapear productos, ver logs de sincronización, resolver conflictos. | — |
| **manager** | Ver estado de sincronización, monitorear errores. | Configurar integración. |
| **cashier** | — | Configurar integración. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `buy` (Crecimiento) o `full` (Premium).
- **Rol mínimo**: `admin` (configuración) o `manager` (monitoreo).
- Requiere cuenta activa con el proveedor POS (Fudo, Bistrosoft, o API propia).

## Paso a paso de las tareas principales

### Configurar integración (solo admin)
1. Ir a **Menú lateral → Configuración → Integración POS**.
2. Seleccionar **proveedor**:
   - Fudo.
   - Bistrosoft.
   - API propia (requiere credenciales).
3. Ingresar **credenciales de conexión**:
   - API Key.
   - URL del sistema.
   - Credenciales adicionales según proveedor.
4. Clic en **"Conectar"**.
5. Sistema verifica conexión.

### Mapear productos (solo admin)
1. Ir a **Integración POS → Mapeo de productos**.
2. El sistema muestra productos de TakEasyGo y del POS externo.
3. Asignar correspondencias:
   - Producto TakEasyGo ↔ Producto POS.
   - Verificar precios coincidenten.
4. Clic en **"Guardar mapeo"**.

### Ver estado de sincronización (admin/manager)
1. Ir a **Integración POS → Estado**.
2. Ver:
   - Última sincronización.
   - Productos sincronizados.
   - Errores pendientes.
   - Conflictos de precio.

### Resolver conflictos (solo admin)
1. Ir a **Integración POS → Conflictos**.
2. Ver productos con precios diferentes entre sistemas.
3. Elegir precio fuente:
   - TakEasyGo.
   - POS externo.
4. Clic en **"Resolver"**.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Proveedor** | Sistema POS a integrar (Fudo, Bistrosoft, API). |
| **Credenciales** | API Key, URL, credenciales de conexión. |
| **Mapeo de productos** | Correspondencia entre productos de ambos sistemas. |
| **Frecuencia de sync** | Cada cuánto se sincroniza (automática o manual). |
| **Resolución de conflictos** | Qué hacer cuando precios difieren. |

## Reglas de negocio y límites

- **Plan buy/full**: Requerido.
- **Solo admin configura**: Managers pueden monitorear.
- **Productos mapeados**: Solo se sincronizan productos con correspondencia.
- **Conflictos requieren decisión**: Los precios diferentes requieren resolución manual.
- **Credenciales seguras**: No compartir API Keys.

## Relación con otros módulos

- **menu**: Los productos se sincronizan con el POS externo.
- **orders**: Las ventas pueden sincronizarse.
- **settings**: Configuración de conexión.
- **reports**: Datos de ventas integrados.

## Preguntas frecuentes

1. **¿Con qué sistemas POS se integra?**
   → Fudo, Bistrosoft y APIs propias.

2. **¿Cómo conecto mi POS existente?**
   → Configuración → Integración POS → proveedor → credenciales → conectar.

3. **¿Los precios se sincronizan?**
   → Sí, pero si difieren, requieren resolución manual de conflictos.

4. **¿Puedo tener dos POS conectados?**
   → No hay soporte definido para múltiples integraciones simultáneas en el código actual.

5. **¿Cada cuánto se sincroniza?**
   → Depende de la configuración (automática o manual).

6. **¿Los managers pueden configurar?**
   → No, solo admin. Managers pueden monitorear.

7. **¿Qué pasa si falla la conexión?**
   → El sistema notifica el error. Verificar credenciales.

8. **¿Puedo mapear productos manualmente?**
   → Sí, en Mapeo de productos, asignar correspondencias.

9. **¿Se sincronizan las ventas?**
   → Depende del proveedor y configuración.

10. **¿Puedo desconectar temporalmente?**
    → Sí, en Configuración → Integración → desconectar.

## Errores y mensajes comuntos

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Integration requires buy plan` | Plan trial/try. | Actualizar plan a buy/full. |
| `Connection failed` | Credenciales incorrectas o sistema caído. | Verificar credenciales y conexión. |
| `Product not mapped` | Producto sin correspondencia. | Completar mapeo. |
| `Price conflict` | Precios diferentes entre sistemas. | Resolver conflicto manualmente. |
| `Insufficient permissions` | Rol sin permiso. | Pedir al admin. |

## Recomendaciones y buenas prácticas

- **Mapear todos los productos**: Para sincronización completa.
- **Verificar precios regularmente**: Detectar conflictos pronto.
- **Mantener credenciales seguras**: No compartir API Keys.
- **Monitorear sincronización**: Revisar estado diariamente.
- **Documentar configuración**: Anotar proveedor y credenciales (seguro).

## Qué hacer si no funciona

Si la integración no conecta o sincroniza:
1. Verificar plan buy/full.
2. Verificar credenciales correctas.
3. Verificar conexión a internet.
4. Verificar estado del proveedor POS.
5. Si persiste, contactar soporte con: negocio, plan, proveedor, error.

## Descripción breve para negocios que NO lo tienen activo

El módulo de Integración POS conecta TakEasyGo con sistemas de punto de venta externos como Fudo o Bistrosoft, sincronizando productos, precios y ventas. Ideal para restaurantes que ya usan un sistema de caja. Disponible desde plan Crecimiento (buy) o Premium (full).