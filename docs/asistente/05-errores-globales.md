# 05-errores-globales.md — Errores generales

Errores que pueden ocurrir en cualquier módulo o flujo del sistema, independientemente del rol o plan.

## Errores de autenticación y sesión

| Código | Mensaje | Causa | Solución |
|--------|---------|-------|----------|
| `auth` | `Invalid credentials` | Email o PIN incorrectos. | Verificar credenciales e intentar de nuevo. Si persistente, contactar a soporte. |
| `auth` | `Account temporarily locked` | Demasiados intentos fallidos (5 fallos de email o límite de tenant de PIN). | Esperar el tiempo indicado en `Retry-After` header (progresivo: 60s → máximo 30min). |
| `auth` | `Access denied` / `ROLE_NOT_ALLOWED` | El rol del usuario no tiene permisos para la acción solicitada. | El usuario debe pedir al administrador que realice la acción, o gestionar sus permisos si corresponde. |
| `auth` | `Session expired` | Se excedió el tiempo máximo de sesión (16 horas desde el login). | Hacer login nuevamente. |
| `auth` | `Invalid session` | La sesión ya no es válida (usuario dado de baja, sesión corrupta, o sede inactiva). | Hacer login nuevamente. |
| `auth` | `Too many logout requests` | Se excedió el límite de logout (rate limit por sub). | Esperar y reintentar más tarde. |
| `auth` | `Too many refresh requests` | Se excedió el límite de refresh de token (10/min por sub). | Esperar y reintentar más tarde. |

## Errores de validación y datos

| Código | Mensaje | Causa | Solución |
|--------|---------|-------|----------|
| `validation_error` | `Validation failed` | El cuerpo de la petición no coincide con el esquema Zod esperado. | Revisar los campos obligatorios, tipos de dato y formato. Los detalles vienen en `details`. |
| `validation_error` | `status required` | Faltó el parámetro `status` en una petición de actualización de orden. | Proporcionar un valor de status válido. |
| `validation_error` | `orderId required` | Faltó el ID de orden en la ruta. | Incluir el ID de orden en la URL o body. |

## Errores de tenant y multi-tenant

| Código | Mensaje | Causa | Solución |
|--------|---------|-------|----------|
| `Tenant mismatch` | El tenantId del token no coincide con el recurso solicitado. | El usuario intenta operar sobre un negocio que no le corresponde. | Verificar que el usuario pertenezca al negocio correcto. Solo admin/Soporte puede traspasar límites de tenant. |
| `location_inactive` | La sede asociada al token ya no está activa. | La sede fue dada de baja o desactivada. | Seleccionar una sede activa o contactar a admin. |

## Errores de operación y infraestructura

| Código | Mensaje | Causa | Solución |
|--------|---------|-------|----------|
| `Order not found` | La orden solicitada no existe en el sistema. | La orden ya fue cancelada, no existe, o el ID es incorrecto. | Verificar el ID de orden y el negocio. Si correcto y no encuentra, contactar soporte. |
| `Event not found` | Evento de cash-sale no encontrado. | El evento fue borrado o nunca existió. | Verificar el eventId y el tenant. |
| `Duplicate key` | Intento de registrar un evento duplicado (orderId + tenantId). | El SaaS reintentó el POST de cash-sale y el evento ya estaba registrado. | El 2do POST retorna 409 `status: "duplicate"`. No es un error, es el comportamiento esperado. |
| `CashSaleEventModel not found` | No se encontró el evento de cash-sale en la base de datos. | Fallo interno o limpieza de base de datos. | Contactar al equipo técnico. |
| `Internal server error` | Error inesperado en el servidor. | Error de lógica no contemplado. | Contactar al equipo de soporte técnico (recolectar timestamp, usuario, módulo, qué se intentó). |
| `Rate limited` | Se excedió el límite de requests por IP o tenant. | Uso intensivo de la API en corto tiempo. | Esperar y reintentar con backoff exponencial. |

## Errores de fiscal y Z Report

| Código | Mensaje | Causa | Solución |
|--------|---------|-------|----------|
| `Fiscal driver not configured` | No hay driver fiscal configurado para el tenant. | Falta configurar WS FE o impresora fiscal. | Configurar fiscal driver en configuración del negocio (requiere plan `full` o `admin`). |
| `Fiscal printer not connected` | La impresora fiscal no está conectada o no responde. | Conexión suelta, puerto incorrecto, o impresora apagada. | Verificar conexión física/puerto, reiniciar impresora, verificar configuración. |
| `Z Report already generated` | Intento de generar un Z Report sobre una caja ya cerrada. | El Z Report es inmutable y se genera UNA sola vez al cerrar. | El Z Report ya está disponible en el historial; no se puede regenerar. Si se perdió, contactar soporte. |
| `Z Report not yet generated` | No hay Z Report para la caja actual. | La caja aún no se cierra o no se generó el reporte. | Cerrar la caja para generar el Z Report. |

## Errores de emparejamiento y dispositivos

| Código | Mensaje | Causa | Solución |
|--------|---------|-------|----------|
| `Device already paired` | El dispositivo ya está emparejado con otro hub. | Emparejar un dispositivo ya emparejado. | Desemparejar el dispositivo anterior o usar uno diferente. |
| `Device blacklisted` | El dispositivo está en la lista negra y no puede conectarse. | El admin dio de baja el dispositivo. | Contactar al admin del negocio para levantar la blacklist si corresponde. |
| `Invalid fingerprint` | La huella digital del JWT no coincide con la del dispositivo. | Token corrompido o dispositivo intervenido. | Volver a emparejar el dispositivo. |
| `Pairing code expired` | El código de emparejamiento ha expirado. | Los códigos de emparejamiento tienen tiempo de vida limitado. | Generar un nuevo código de emparejamiento (acción de admin/manager). |