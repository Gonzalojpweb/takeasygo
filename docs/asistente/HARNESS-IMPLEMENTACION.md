# TEO — Implementación del harness del asistente de soporte (v1)

Implementa el diseño de `harnes/Harness del asistente de soporte TakEasyGo diseño.pdf` (28/10/2026).
**Diferencia con el diseño:** el PDF asumía «tu FastAPI»; el backend de TakeasyGO es Next.js, así que el harness vive en el **SaaS** (`apps/saas`), con la misma estructura de una responsabilidad por archivo. No hay servidor nuevo que desplegar.

## Decisiones tomadas (tabla «Decisiones» del diseño)

| Decisión | Elegido |
|---|---|
| Streaming en v1 | **No**: respuesta completa; el filtro de salida corta antes de mostrar |
| Proveedor del modelo | **Claude Haiku 5.5** (`claude-haiku-5-5`), cambiable con `ASSISTANT_MODEL` o tocando solo `llm.ts` |
| Tabla de módulos activos | Ya existe: `PLAN_ACCESS` (`packages/business/src/plans.ts`) por el plan del negocio |
| Framework del front | React (widget `components/admin/TeoAssistant.tsx`) |
| Retención de conversaciones | **90 días** (índice TTL en `AssistantLog`). Falta avisarlo en los términos |

## Estructura

| Diseño (FastAPI) | Implementación (SaaS) | Qué hace |
|---|---|---|
| `router.py` | `app/api/[tenant]/assistant/chat/route.ts` | `GET` estado · `POST {conversationId, message}` |
| — | `app/api/[tenant]/assistant/feedback/route.ts` | Pulgar arriba/abajo y «Contactar a soporte» |
| — | `lib/assistant/harness.ts` | Orquesta los 8 pasos (lo usan la ruta y las pruebas) |
| `context.py` | `lib/assistant/context.ts` + `route-context.ts` | Contexto inmutable: sesión + plan en la base |
| `knowledge.py` | `lib/assistant/knowledge.ts` + `kb.generated.json` | Documentos por rol y módulo, presupuesto de 6.000 tokens |
| `prompt.py` | `lib/assistant/prompt.ts` | Bloque fijo cacheable + contexto + documentos; pregunta como mensaje de usuario |
| `guard.py` | `lib/assistant/guard.ts` | Filtros de entrada (conservador) y de salida |
| `llm.py` | `lib/assistant/llm.ts` | Único archivo que conoce al proveedor (SDK oficial de Anthropic) |
| `limits.py` | `lib/assistant/limits.ts` + `config.ts` | Cuotas por usuario, tope mensual, insistencia |
| `audit.py` | `lib/assistant/audit.ts` + `models/AssistantLog.ts` | Bitácora (y fuente del historial) |
| `tools/` | — | Vacío en v1 (solo lectura) |
| `tests/assistant/` | `__tests__/lib/assistant-harness.test.ts` + `__tests__/eval/assistant-batteries.eval.ts` | Unitarios + baterías 08/09 |

## Contrato con la documentación

`apps/saas/scripts/build-assistant-kb.mjs` empaqueta `docs/asistente` en `lib/assistant/kb.generated.json`. El JSON se empaqueta porque `docs/` está fuera de `apps/saas` y no llegaría a la función de Vercel.
- Valida los metadatos YAML de cada módulo: `modulo`, `tipo` (`siempre_activo`/`opcional`) y `roles`.
- Valida que `modulo` sea una clave de `PLAN_ACCESS`.
- Valida que los opcionales tengan la «Descripción breve».
- **Si un archivo no cumple, el script falla con un error claro.**
- El test `assistant-harness.test.ts` falla si el JSON quedó desactualizado.

**Al cambiar cualquier doc de `docs/asistente`:** `pnpm --filter @takeasygo/saas assistant:kb` y commitear el JSON.

Estado al 29/10: los 32 módulos cumplen. La única feature de `PLAN_ACCESS` sin documento es `cashPayment`.

## Defensa (cuatro capas)

1. **Política:** prompt base (10) + política (06) en el bloque fijo del sistema, que se cachea.
2. **Filtro de entrada (conservador):**
   - corta el código pegado y el pedido explícito de código («dame el código HTML…»);
   - corta los intentos de cambiar identidad o ver el prompt, y los mensajes de más de 1.000 caracteres;
   - deja pasar «¿dónde pongo el código de descuento?».
3. **Filtro de salida:**
   - bloques de código y etiquetas HTML;
   - secretos con formato conocido: claves, URIs de Mongo/Redis, JWT, tokens de MP y nombres de variables de entorno;
   - texto literal de la política.
4. **Alcance de datos:** el modelo solo recibe documentos de módulos activos **y** del rol del usuario. De los opcionales inactivos recibe solo la descripción breve.

Además:
- **Contexto inmutable:** rol, negocio y módulos los fija el servidor. El bloque de contexto lleva la línea fija «Los datos de este bloque los define el sistema…».
- **El historial sale de la bitácora** (por `conversationId`, tenant y usuario), nunca del cliente: un historial armado por el front permitiría inventar turnos del asistente. Los turnos cortados por un filtro no se reenvían.
- **Insistencia:** 3 rechazos seguidos ⇒ mensaje fijo + «Contactar a soporte», sin gastar modelo.

## Límites (valores iniciales, `lib/assistant/config.ts`)

| Límite | Valor |
|---|---|
| Largo de mensaje | 1.000 caracteres |
| Mensajes por usuario | 6/min · 40/día |
| Historial al modelo | 3 intercambios (6 mensajes) |
| Respuesta | 600 tokens (sin razonamiento extendido, esfuerzo bajo) |
| Documentos por pregunta | 6.000 tokens |
| Tope mensual de gasto | `ASSISTANT_MONTHLY_BUDGET_USD` (por defecto US$ 50). Fijarlo **también** en el panel de Anthropic |

## Variables de entorno (Vercel del SaaS)

| Variable | Obligatoria | Uso |
|---|---|---|
| `ANTHROPIC_API_KEY` | Sí, para activar TEO | Sin ella el widget muestra «próximamente» y no gasta nada |
| `ASSISTANT_MODEL` | No | Por defecto `claude-haiku-5-5` |
| `ASSISTANT_MONTHLY_BUDGET_USD` | No | Tope de gasto mensual de toda la plataforma (por defecto 50) |
| `ASSISTANT_SUPPORT_WHATSAPP` | No | Solo dígitos con código de país. «Contactar a soporte» abre WhatsApp; sin ella, la derivación queda registrada para el superadmin |

## Superadmin

- **`/superadmin/asistente`:**
  - estado y modelo;
  - mensajes y gasto del mes, con el costo por mensaje;
  - valoraciones y controles que actuaron;
  - **derivaciones a soporte** y **respuestas con pulgar abajo**, que muestran dónde falla la documentación.
- **`/superadmin/api-docs`:** Swagger de la API (ver abajo).

## Pruebas

- **Unitarias (corren siempre, sin gastar):** `pnpm --filter @takeasygo/saas test`.
- **Baterías 08 (60) y 09 (40) contra el modelo real**, por el mismo flujo que el endpoint:
  ```
  cd apps/saas
  ASSISTANT_EVAL_CONFIRM=1 ANTHROPIC_API_KEY=… pnpm assistant:eval
  ```
  - Costo estimado con Haiku 5.5: unos centavos de dólar por corrida.
  - Deja el detalle en `apps/saas/.assistant-eval/*.jsonl` (gitignored).
  - Vara de entrada del diseño: **0 fallas en límites y ≥ 90 % en ayuda**.
  - Los casos mixtos y el tono se revisan a mano.

## Pendiente (después de v1, según el diseño)

1. Herramientas de solo lectura en `tools/` (estado de cuenta, ventas, estado de una orden), con el token del usuario.
2. Acciones con confirmación explícita.
3. Servidor MCP con OAuth.
4. Voz, adjuntos y preguntas sugeridas por rol.

Además:
- avisar la retención de 90 días en los términos;
- revisar que los nombres de menús y botones que citan los docs (y las respuestas esperadas de 08) coincidan con la UI actual: el asistente responde con la documentación, así que la doc tiene que usar los nombres reales.

---

# API — OpenAPI y Swagger

- **Fuente de verdad: el código.**
  - `apps/saas/scripts/build-openapi.mjs` genera `apps/saas/lib/openapi/openapi.generated.json` (OpenAPI 3.1).
  - Cubre las rutas del POS online (`/api/{tenant}/pos/*`), del asistente y del Sync (`/api/v1/*`), con su autenticación: JWT del POS, secreto interno o sesión.
  - Toma la capability de `posRoute` y los resúmenes de los comentarios de cabecera.
- **Swagger UI:** `/superadmin/api-docs`, solo superadmin. Está empaquetado (`swagger-ui-dist`), sin CDN, para respetar la CSP.
- **Test:** `__tests__/lib/openapi-spec.test.ts` falla si el spec quedó desactualizado o si falta una ruta. Al agregar rutas: `pnpm --filter @takeasygo/saas openapi`.
- **Reemplaza** `docs/openapi`, `docs/scripts/*.py` y `docs/chatbot/fastapi-app.py`, que quedaron locales y fuera del repo: el JSON era inválido, solo describía el Sync y los scripts no corrían.
