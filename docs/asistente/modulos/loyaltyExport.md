---
modulo: loyaltyExport
tipo: opcional
roles: [admin]
version_doc: "2026-10-27"
---
# Exportación del Club de Fidelización

## Qué es y para qué sirve
El módulo de Exportación del Club permite descargar la lista completa de miembros en formato CSV/Excel para análisis externo, marketing o respaldo de datos.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Exportar lista completa de miembros con todos sus datos. | — |
| **manager** | — | Exportar lista (solo admin). |
| **cashier** | — | Exportar lista. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `buy` (Crecimiento) o `full` (Premium).
- **Rol mínimo**: `admin`.
- Si el plan es `trial` o `try`, la exportación no está disponible (aunque el club sí).

## Paso a paso de las tareas principales

### Exportar lista de miembros (solo admin)
1. Ir a **Menú lateral → Club de fidelización**.
2. Clic en **"Exportar"**.
3. Seleccionar **formato**:
   - CSV.
   - Excel.
4. Seleccionar **columnas a incluir**:
   - Nombre.
   - Email.
   - Teléfono.
   - Puntos actuales.
   - Fecha de registro.
   - Última compra.
5. Clic en **"Descargar"**.
6. El archivo se descarga a tu dispositivo.

### Exportar miembros filtrados (solo admin)
1. Ir a **Club de fidelización → Miembros**.
2. Aplicar filtros:
   - Por puntos (ej. > 500).
   - Por fecha de registro.
   - Por actividad reciente.
3. Clic en **"Exportar"**.
4. Descargar solo los miembros filtrados.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Formato** | CSV o Excel. |
| **Columnas** | Qué campos incluir en la exportación. |
| **Filtros** | Restringir a subconjunto de miembros. |
| **Codificación** | UTF-8 para compatibilidad con acentos. |

## Reglas de negocio y límites

- **Plan buy/full**: Requerido.
- **Solo admin**: Único rol con acceso.
- **Multi-tenant**: Solo miembros del propio negocio.
- **Datos personales**: La exportación incluye datos personales - manejar con cuidado.
- **Sin límite de filas**: No hay máximo definido.

## Relación con otros módulos

- **loyaltyClub**: Fuente de datos a exportar.
- **loyaltyAnalytics**: Complementa con análisis (plan full).
- **crm**: Los datos pueden alimentar el CRM.

## Preguntas frecuentes

1. **¿Cómo exporto la lista de miembros?**
   → Club de fidelización → Exportar → formato → columnas → descargar.

2. **¿Puedo exportar en Excel?**
   → Sí, seleccionar formato Excel.

3. **¿Los managers pueden exportar?**
   → No, solo admin.

4. **¿Puedo exportar solo miembros con muchos puntos?**
   → Sí, aplicar filtro antes de exportar.

5. **¿Qué columnas incluye?**
   → Configurable: nombre, email, teléfono, puntos, fechas.

6. **¿Se exportan datos sensibles?**
   → Sí, incluye datos personales. Manejar según política de privacidad.

7. **¿Puedo exportar en plan trial?**
   → No, requiere plan buy/full.

8. **¿Hay límite de miembros a exportar?**
   → No, se exportan todos los que cumplan filtros.

9. **¿El formato es compatible con Excel?**
   → Sí, tanto CSV como Excel.

10. **¿Puedo programar exportaciones automáticas?**
    → No hay función de exportación programada definida en el código.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Export requires buy plan` | Plan trial/try. | Actualizar plan a buy/full. |
| `Insufficient permissions` | Rol no admin. | Pedir al admin. |
| `No members to export` | Sin miembros o filtros muy restrictivos. | Cambiar filtros. |
| `Export failed` | Error interno. | Reintentar o contactar soporte. |

## Recomendaciones y buenas prácticas

- **Exportar periódicamente**: Respaldo regular de datos.
- **Usar filtros**: Exportar solo lo necesario.
- **Proteger datos**: Los datos exportados contienen información personal.
- **Verificar codificación**: Asegurar que acentos se muestren correctamente (UTF-8).
- **Usar para marketing**: Enviar campañas a segmentos específicos.

## Qué hacer si no funciona

Si la exportación no funciona:
1. Verificar plan buy/full.
2. Verificar rol admin.
3. Verificar que haya miembros.
4. Si persiste, contactar soporte con: negocio, plan, formato intentado, error.

## Descripción breve para negocios que NO lo tienen activo

El módulo de Exportación permite descargar la lista de miembros del Club de Fidelización en CSV/Excel para análisis externo, marketing o respaldo. Disponible desde plan Crecimiento (buy) o Premium (full), solo para rol admin.