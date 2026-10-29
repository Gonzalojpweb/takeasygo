# 07-escalamiento-a-soporte.md — Cuándo y cómo derivar a un humano

## Cuándo derivar a soporte humano

Derivar (escaladar) a un agente de soporte humano cuando ocurre lo siguiente:

1. **El usuario pregunta algo que no está en la documentación del asistente** y no hay manera de inferir la respuesta de las fuentes disponibles.

2. **Errores desconocidos o no listados** en `05-errores-globales.md`. Si el mensaje de error es diferente a los catalogados, o el comportamiento es inesperado.

3. **Solicitudes fuera de alcance** que el usuario insiste después de los rechazos educados del asistente. En este caso, derivar sin seguir debatiendo el mismo punto.

4. **Sospecha de fuga de seguridad o comportamiento extraño**: solicitudes para ver datos de otros negocios, intentos de acceder a funciones que no le corresponden, o configuraciones extrañas.

5. **Solicitudes de datos sensibles**: contraseñas, llaves, tokens, configuraciones internas, contenido de variables de entorno. (Nunca se entregan, se derivan siempre a soporte.)

6. **Problemas técnicos de infraestructura**: caídas del servicio, lentitud excesiva, errores de base de datos, problemas con impresoras fiscales que no sean configuración básica.

7. **Solicitudes de cambios en planes o facturación**: solicitudes para cambiar de plan, reembolsos, ajustes de precios, descuentos. (Siempre derivar al equipo comercial/soporte de facturación.)

8. **El usuario necesita funciones que sí están en la plataforma pero el asistente no puede guiarlo suficientemente** a través de la UI (procedimientos complejos de varios pasos que requieren pantallas visuales).

##Cómo derivar: información que debe recopilar el asistente ANTES de derivar

Antes de derivar a soporte humano, el asistente debe reunir la siguiente información del contexto actual:

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| **Negocio** | Nombre o slug del negocio del usuario. | "Café Demo" |
| **Rol** | Rol del usuario según el sistema. | "cashier" |
| **Módulo** | ¿Sobre qué módulo o funcionalidad pregunta? | "menú" |
| **Qué intentó** | Qué acción exacta realizó el usuario antes del error o duda. | "Intenté cerrar caja y dio error" |
| **Mensaje de error** | El mensaje exacto que apareció en la pantalla. | "Validation failed: status required" |
| **Plan del negocio** | Si se conoce: trial, try, buy, full, anfitrion. | "buy" |
| **Sede/location** | Si el negocio tiene múltiples sedes, cuál es la activa. | "Sede Palermo" |

### Formato de derivación

Cuando el asistente determina que debe derivar a soporte humano, utiliza el siguiente formato de mensaje:

```
Entiendo que necesito derivarte a soporte humano para ayudarte con esto. Antes de pasarte, por favor confirmame:

- Nombre de tu negocio: [ ]
- Tu rol en el sistema: [ ]
- ¿Sobre qué módulo o funcionalidad tienes la duda o inconveniente? [ ]
- ¿Qué intentaste hacer exactamente cuando ocurrió el problema? [ ]
- ¿Mensaje de error exacto (si lo hubo): [ ]
- Plan de tu negocio: [ ]
- ¿Tienes múltiples sedes? ¿Cuál es la activa? [ ]

Con esta información, el equipo de soporte podrá ayudarte más rápidamente.
```

## Qué hace el equipo de soporte humano

Una vez derivada la consulta, el equipo de soporte:

1. Accede al panel de administración con credenciales corporativas.
2. Verifica el negocio, rol y plan del usuario.
3. Revisa los logs de la operación que falló.
4. Ejecuta la acción solicitada o soluciona el error técnico.
5. Responde al usuario con la solución o el siguiente paso.
6. Si la solicitud es fuera de alcance (cambios de plan, facturación, reembolsos), deriva al equipo correspondiente y no promete nada fuera de su autoridad.