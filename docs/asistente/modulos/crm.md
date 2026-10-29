---
modulo: crm
tipo: opcional
roles: [admin, manager]
version_doc: "2026-10-27"
---
# CRM — Base de Datos de Consumidores

## Qué es y para qué sirve
El módulo CRM (Customer Relationship Management) es la base de datos de consumidores que permite gestionar la relación con los clientes. Incluye información de contacto, historial de compras, segmentación y herramientas de comunicación.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Crear/editar consumidores, ver historial, segmentar, exportar, comunicar. | — |
| **manager** | Ver consumidores, historial, segmentos, registrar interacciones. | Exportar, configuraciones avanzadas. |
| **cashier** | Ver consumidores básicos al cobrar. | Gestionar CRM completo. |
| **waiter** | — | Gestionar CRM. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `buy` (Crecimiento) o `full` (Premium).
- **Rol mínimo**: `admin` o `manager`.
- Si el plan es `trial` o `try`, el módulo no está disponible.

## Paso a paso de las tareas principales

### Crear consumidor (admin/manager)
1. Ir a **Menú lateral → CRM → Consumidores**.
2. Clic en **"+ Nuevo consumidor"**.
3. Completar campos:
   - **Nombre**: ej. "Juan Pérez".
   - **Email**: ej. "juan@ejemplo.com".
   - **Teléfono**: ej. "11-1234-5678".
   - **Fecha de nacimiento** (opcional): para promociones.
   - **Notas**: preferencias, alergias, etc.
4. Clic en **"Guardar"**.

### Ver historial de consumidor (admin/manager)
1. Ir a **CRM → Consumidores**.
2. Buscar por nombre/email.
3. Clic en consumidor.
4. Ver:
   - Historial de compras.
   - Total gastado.
   - Última visita.
   - Segmento asignado.
   - Notas.

### Segmentar consumidores (admin/manager)
1. Ir a **CRM → Segmentos**.
2. Ver segmentos automáticos:
   - Nuevos.
   - Recurrentes.
   - VIP.
   - En riesgo.
   - Perdidos.
3. O crear segmento personalizado con filtros.

### Exportar base de consumidores (solo admin)
1. Ir a **CRM → Consumidores**.
2. Clic en **"Exportar"**.
3. Seleccionar columnas.
4. Descargar CSV/Excel.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Nombre** | Nombre completo del consumidor. |
| **Email** | Correo electrónico para comunicación. |
| **Teléfono** | Número telefónico. |
| **Fecha de nacimiento** | Para promociones de cumpleaños. |
| **Notas** | Información adicional (preferencias, alergias). |
| **Segmento** | Clasificación automática o manual. |
| **Origen** | Cómo llegó el consumidor (QR, online, etc.). |

## Reglas de negocio y límites

- **Plan buy/full**: Requerido.
- **Multi-tenant**: Consumidores por negocio.
- **Datos encriptados**: Nombre, email, teléfono se encriptan en base de datos.
- **Sin límite de consumidores**: No hay máximo definido en código.
- **Segmentación automática**: El sistema asigna segmento según comportamiento.

## Relación con otros módulos

- **orders**: Historial de compras alimenta el CRM.
- **loyaltyClub**: Los miembros del club son consumidores.
- **cis**: Customer Intelligence System complementa con métricas.
- **delivery**: Datos de entrega de consumidores.
- **reports**: Reportes de comportamiento de consumidores.

## Preguntas frecuentes

1. **¿Cómo agrego un consumidor?**
   → CRM → Consumidores → "+ Nuevo" → datos → guardar.

2. **¿Puedo ver cuánto gastó un cliente?**
   → Sí, en consumidor → historial → total gastado.

3. **¿Cómo exporto la base?**
   → CRM → Exportar → columnas → descargar (solo admin).

4. **¿Qué es segmentación?**
   → Clasificación automática por comportamiento (VIP, en riesgo, etc.).

5. **¿Los managers pueden exportar?**
   → No, solo admin.

6. **¿Puedo agregar notas a un consumidor?**
   → Sí, en editar consumidor → campo notas.

7. **¿Se sincroniza con Google Contacts?**
   → El código sugiere integración con Google Contacts. [VERIFICAR: alcance exacto de la integración]

8. **¿Puedo buscar por teléfono?**
   → Sí, en CRM → consumidores → buscar.

9. **¿Los datos están protegidos?**
   → Sí, se encriptan datos sensibles en base de datos.

10. **¿Puedo ver quién es nuevo este mes?**
    → Sí, filtrar por fecha de registro.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `CRM requires buy plan` | Plan trial/try. | Actualizar plan a buy/full. |
| `Email already exists` | Email duplicado. | Verificar si es consumidor existente. |
| `Insufficient permissions` | Rol sin permiso. | Pedir a admin/manager. |
| `Export requires admin` | Manager intentando exportar. | Pedir al admin. |

## Recomendaciones y buenas prácticas

- **Mantener datos actualizados**: Contactos y preferencias.
- **Usar notas**: Registrar alergias, preferencias, eventos.
- **Revisar segmentos**: Identificar clientes en riesgo.
- **Segmentar comunicaciones**: Enviar mensajes relevantes.
- **Proteger datos**: Respetar política de privacidad.
- **Integrar con club**: Vincular miembros del club al CRM.

## Qué hacer si no funciona

Si CRM no carga o hay errores:
1. Verificar plan buy/full.
2. Verificar permisos.
3. Si persiste, contactar soporte con: negocio, plan, consumidor, error.

## Descripción breve para negocios que NO lo tienen activo

El módulo CRM es la base de datos de consumidores que gestiona la relación con clientes: información de contacto, historial de compras, segmentación y comunicación. Es esencial para marketing y fidelización. Disponible desde plan Crecimiento (buy) o Premium (full).