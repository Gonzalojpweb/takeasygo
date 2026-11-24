# Display Studio — hoja de ruta de implementación

Plantillas de diseño con campos editables + desbloqueo Premium con Mercado Pago.
Versión revisada del informe original (`displaynow.md`, fuera del repo), ajustada a
cómo está construido hoy Pantallas. Cada punto dice **qué**, **dónde** y **por qué**.

---

## 0. Correcciones al informe original (leer primero)

| Informe original | Cómo debe quedar | Por qué |
|---|---|---|
| Compra por `tenantId + brandId` | Solo `tenantId` | En TakeasyGO **cada marca es un Tenant** (`Tenant.organizationId` la agrupa). Las sedes son `Location` del tenant. «Tenant + Marca, heredan las sedes» = la compra es por `tenantId`. Un `brandId` aparte duplicaría la verdad |
| Colección `DisplayTemplate` en la base | Catálogo **en código** (`lib/display/studio/catalog.ts`), con overrides opcionales en la base | El diseño de cada plantilla es código del reproductor (GSAP). Si el catálogo vive en la base, puede quedar una plantilla publicada sin dibujante, o al revés. Código versionado = una sola fuente. Para activar/desactivar o cambiar precio sin deploy: colección chica `DisplayTemplateOverride { templateId, isActive, priceUsd }` (fase 3, opcional) |
| `/api/display/templates/:id/checkout` | `/api/[tenant]/display-studio/[templateId]/checkout` | `/api/display/*` es la API **de los equipos** (token de pantalla), no de usuarios. Todo lo del panel va bajo `/api/[tenant]/…` con `requireTenantRole` |
| Campo nuevo `templateInstance` en AppStory | `screenTemplate: { kind: 'studio', config }` | Ya existe `screenTemplate` con `kind` (menu, promos, featured, composition). Agregar un `kind` reutiliza manifiesto, cupo de 20 activas, programación, grupos, atribución QR y la lista del panel sin tocar nada de eso |
| Status `approved / pending / rejected` | `pending / approved / refunded` | Un pago rechazado no desbloquea, así que no hace falta guardarlo. Lo que sí hay que manejar es la **devolución** o el contracargo: ahí la plantilla vuelve a bloquearse |
| «El webhook crea el registro approved» | Se crea `pending` al iniciar el pago con el **monto en pesos congelado**. El webhook lo aprueba si lo pagado lo cubre | Sin el monto congelado no hay cómo verificar que se pagó lo correcto. Con el registro previo, el pago se puede confirmar también a la vuelta de MP, sin esperar al webhook |

---

## 1. Reglas que no se negocian

- **Solo plan Élite** (`plan: 'high'`): lo controla `screenPiecesContext` (`lib/display/pieces-route.ts`), el mismo que las piezas.
- **Mercado Pago (autorizado por el dueño el 24/11):** se toca MP para **agregar** estos cobros. Lo que **no se toca ni se puede romper**:
  - las credenciales actuales: tokens de plataforma y de comercios, OAuth (`lib/mp-oauth.ts`) y el secret del webhook;
  - el split de pagos y las comisiones: `payments/create-preference`, `commissions/pay`, `webhooks/mercadopago/*` existentes, `billing/*`;
  - checkout de pedidos, reservas y suscripciones.

  Todo lo de Studio va en **archivos nuevos**. La cuenta de plataforma se usa solo para **leer** su cliente con `getPlatformMPClient()`, sin modificar ese archivo, y la referencia propia `display-template:` no choca con las de comisiones (`commission-intent:`, `commission:`). Antes del merge se corre la suite completa de MP/comisiones: tiene que dar el mismo resultado que en `main`.
- POS, checkout y Sync Layer no se tocan.
- Nada de IP, user agent ni teléfono en claro. De MP solo se guarda el `mpPaymentId`.
- Sin datos de comercios reales en el repo: tests con datos ficticios y sin nombres de pilotos.
- Commits solo en `dev`. A `main` únicamente cuando lo pida el dueño.

---

## 2. Arquitectura

```
Panel (Next.js, apps/saas)                     Reproductor (Vite, apps/display)
───────────────────────────                    ────────────────────────────────
Pantallas › Studio
  Biblioteca  ──GET /api/[t]/display-studio
  Editor      ──POST /api/[t]/screen-pieces/templates  {kind:'studio'}
  Vista previa ─postMessage─────────────────▶  /preview (iframe, ya existe)
  Desbloquear ──POST …/[templateId]/checkout ─▶ Mercado Pago (cuenta plataforma)
                                                     │
  vuelta ?pago=ok&payment_id ─POST …/confirm         │ webhook
                                                     ▼
                         /api/webhooks/mercadopago/display-template
                                                     │
                                  DisplayTemplatePurchase (approved)
                                                     │
Manifiesto /api/display/manifest ─ arma board 'studio' (si free o desbloqueada)
                                  └──────────────▶ studio-board.ts (GSAP, lienzo DW×DH)
```

---

## 3. Modelo de datos

### 3.1 Catálogo — `apps/saas/lib/display/studio/catalog.ts` (código, sin imports de servidor)

```ts
interface StudioTemplate {
  id: 'golden-bites' | 'cheese-burger' | 'chocolate-croissant' | …
  name, description, category: 'promo'|'destacado'|'combo'|'menu'|'lanzamiento'
  tier: 'free' | 'premium'
  priceUsd: number | null          // 10 en las Premium
  orientations: ('portrait'|'landscape')[]
  previewImage: string             // captura estática en /public/studio/<id>-<orient>.webp
  fields: StudioField[]            // qué se puede editar
}
type StudioField =
  | { key, type: 'image', label, required?, aspect? }
  | { key, type: 'text',  label, max, required?, default }
  | { key, type: 'price', label }                    // centavos
  | { key, type: 'color', label, default }           // '' = color de la marca
  | { key, type: 'toggle',label, default }           // mostrar/ocultar elemento opcional
  | { key, type: 'font',  label }                    // curada o propia
  | { key, type: 'list',  label, maxItems }          // filas {label, price}
```

- `studioValuesSchema(t)` arma el zod **a partir de los campos**: largos, obligatorios, hex, rangos de precio. Lo que no es un campo se descarta.
- `studioConfigSchema = { templateId, orientation, designWidth, designHeight, viewing, pageSeconds, values }`. Valida que la orientación coincida con el tamaño y que la plantilla admita esa orientación.

### 3.2 `apps/saas/models/DisplayTemplatePurchase.ts`

```ts
{ tenantId: ObjectId, templateId: string,
  status: 'pending'|'approved'|'refunded',
  source: 'mercadopago'|'manual',            // manual = la otorga el SuperAdmin (pilotos)
  amountArs: number (centavos, congelado), amountUsd: number, rate: number,
  mpPaymentId: string|null, purchasedBy: ObjectId|null, grantedBy: ObjectId|null,
  approvedAt: Date|null, timestamps }
índice único { tenantId, templateId }
helper unlockedTemplateIds(tenantId): Set<string>
```

### 3.3 Pieza — `models/AppStory.ts`

- `ScreenTemplateKind` suma `'studio'`, tanto en el tipo como en el `enum` del schema.
- `screenTemplate.config` guarda el `StudioConfig` completo, con los valores ya validados.

### 3.4 Fuentes propias (fase 3) — `models/TenantFont.ts`

```ts
{ tenantId, family, url (Cloudinary, carpeta de pantallas del comercio), bytes, licenseAccepted: true, createdBy }
```

---

## 4. Rutas

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /api/[tenant]/display-studio` | Élite · admin/manager con `promotions.write` | Catálogo con `unlocked` por plantilla, `priceArs` al cambio del momento y la lista de fuentes |
| `POST /api/[tenant]/display-studio/[templateId]/checkout` | **admin y manager (encargado)** con `promotions.write` | Crea la compra `pending` con el monto congelado y la preferencia de MP. Devuelve `{ initPoint, amount, rate }`. 409 si ya está desbloqueada |
| `POST /api/[tenant]/display-studio/confirm` `{ paymentId }` | Élite · gestión | A la vuelta de MP: consulta el pago **a la API de MP** y lo aplica (idempotente). Devuelve `unlocked[]` |
| `GET /api/[tenant]/display-studio/purchases` | admin · manager | «Mis compras» con los datos del comprobante |
| `GET /api/[tenant]/display-studio/purchases/[id]/receipt` | admin · manager | Datos del comprobante (el PDF se arma en el cliente con jsPDF) |
| `POST /api/webhooks/mercadopago/display-template` | Mercado Pago | Firma `x-signature` (HMAC del secret de plataforma; si el secret existe, la firma es obligatoria). Consulta el pago y lo aplica. 500 = MP reintenta |
| `POST /api/[tenant]/screen-pieces/templates` (existe) | gestión | Suma `kind:'studio'`: valida imágenes propias y **402 si es Premium sin desbloquear** |
| `PATCH /api/[tenant]/screen-pieces/[pieceId]` (existe) | gestión | Hace la misma validación al editar |
| `POST /api/[tenant]/screen-pieces/preview` (existe) | gestión | Suma `kind:'studio'` → board para el iframe de vista previa |
| `POST /api/[tenant]/display-studio/fonts` (fase 3) | admin | Sube una `.woff2` propia (ver §8) |
| `GET/POST /api/superadmin/display-studio` | SuperAdmin | Ver compras de un comercio. Otorgar o retirar sin cobro (pilotos, cortesías). Queda auditado |
| `GET /api/display/manifest` (existe) | equipo | Incluye las piezas `studio` solo si son Free o si `unlocked.has(templateId)` |

---

## 5. Flujo de compra (detalle)

1. **Precio (decisión: dólar automático).** Lista en USD → se cobra en ARS. Cambio:
   1. dólar oficial (venta) de `dolarapi.com`, cacheado 6 h y con límites de cordura (50 a 100.000);
   2. si falla, se usa la última cotización buena guardada en `PlatformConfig.displayStudio.lastRate`, solo si tiene menos de 72 h;
   3. si tampoco hay, **no se cobra** («probá en unos minutos»). Nunca se inventa un cambio.

   `DISPLAY_STUDIO_USD_ARS` queda solo como override de emergencia y no se usa por defecto.

   Redondeo hacia arriba a la centena. En la UI: «USD 10 · hoy $ X».
2. **Checkout** (`lib/display/studio/purchase.ts › createTemplateCheckout`):
   - hace upsert de la compra `pending` con `amountArs`, `rate` y `purchasedBy`;
   - crea la `Preference`: `external_reference: display-template:<purchaseId>`, `notification_url` a la ruta nueva y `back_urls` a `/<slug>/admin/pantallas?studio=<id>&pago=ok|error|pendiente`;
   - escribe en la auditoría `display.template_checkout`.
3. **Aprobación** (`applyTemplatePayment(paymentId)`). La comparten el webhook y `confirm`:
   - consulta el pago a MP con la cuenta de plataforma;
   - ignora todo lo que no sea `display-template:`;
   - exige `status=approved`, `currency_id=ARS` y `transaction_amount ≥ amountArs`;
   - hace un `updateOne` condicional (`status ≠ approved`), lo que da idempotencia y evita carreras;
   - escribe en la auditoría `display.template_unlocked`.
4. **Devolución o contracargo.** Si el mismo `mpPaymentId` vuelve como `refunded` o `charged_back`, pasa a `refunded`. Las piezas quedan guardadas y el manifiesto deja de mostrarlas. El panel muestra «Volvé a desbloquear».
5. **Monto que no coincide.** Se registra en el log y **no se aprueba**. Queda para revisión manual, y el SuperAdmin puede otorgarla.
6. **Panel.** Al volver con `?pago=ok&payment_id=…` llama a `confirm`, muestra un toast y refresca la biblioteca. Con `pendiente` muestra «Lo acreditamos apenas MP lo confirme».
7. **Comprobante (decisión: sin factura por ahora).** Cada compra aprobada genera un **comprobante interno numerado**:
   - número `DS-000001`, con un contador atómico en `PlatformConfig`;
   - comercio (razón social y CUIT si están cargados), plantilla, USD de lista, cambio usado, ARS cobrado, fecha, número de operación de MP y la leyenda «Comprobante no válido como factura».
   - Se ve y se descarga en PDF (jsPDF, ya está en el proyecto) desde «Pantallas › Studio › Mis compras».
   - El dueño y el SuperAdmin lo reciben por email (servicio de mails existente). En el email no va nada sensible, solo el link al panel.
   - Campos nuevos en la compra: `receiptNumber`, `receiptIssuedAt`.
   - Queda preparado para que más adelante el comprobante se reemplace por una factura sin cambiar el flujo.

---

## 6. Reproductor — `apps/display/src/player/templates/studio-board.ts`

- Un **renderer por plantilla** (`renderGoldenBites`, `renderCheeseBurger`, `renderChocolateCroissant`) sobre una base común que se reutiliza de `composition-board.ts`:
  - lienzo DW×DH con `fitCanvas` y unidad `U`;
  - `data-fit` para que los textos entren;
  - `readableOn` para el contraste;
  - el QR con atribución `?source=pantalla.<id>`;
  - `stamp()` para el sello de descuento.
- **Animación con GSAP:** entrada por capas (foto → título → precio con rebote → CTA), Ken Burns lento en la foto y loop suave mientras dure `pageMs`. Respeta `prefers-reduced-motion` y el modo ahorro (pestaña oculta).
- **Sin red en la TV:** imágenes, logo y fuentes viajan en `assets` y se guardan en caché como hoy.
- **Robustez:** si falta una imagen opcional o un texto viene vacío, el elemento se oculta y el resto se reacomoda. Nunca queda un hueco.
- Se registra en `board.ts` (`kind === 'studio'`) y en `preview.ts`.
- Tests en `board.test.ts`: cada plantilla en las dos orientaciones, sin desbordes, toggles, color de acento vacío → marca, sin foto opcional.

---

## 7. Panel — `apps/saas/components/admin/displays/studio/`

| Componente | Qué hace |
|---|---|
| `StudioLibrary.tsx` | Grilla de tarjetas con miniatura (`previewImage`), nombre y categoría. Las Free llevan la insignia «Gratis». Las Premium no desbloqueadas llevan candado y «Desbloquear · USD 10 (hoy $ X)»: el botón lo ven el admin y el manager (encargado), y el resto de los roles ve «Pedile al administrador o encargado que la desbloquee». Las desbloqueadas llevan «Tuya» |
| `StudioPurchases.tsx` | «Mis compras»: plantilla, fecha, monto, estado y botón «Comprobante (PDF)» |
| `StudioEditor.tsx` | Formulario generado desde `fields`: subida de imagen (flujo firmado existente a la carpeta de pantallas), textos con contador, precio, selector de color con «usar el de mi marca», toggles y fuente. A la derecha, la vista previa en vivo (iframe `/preview` existente, con un *debounce* de 300 ms) y un selector de orientación y tamaño (1080×1920, 1920×1080, 720p) |
| Guardar | Usa el mismo diálogo que las demás piezas: sede, programación, franjas, grupos de pantallas. Se crea **pausada** |
| `ScreenPiecesManager.tsx` | Suma la pestaña «Studio» y el botón «Editar» en las piezas `studio`. Las Premium bloqueadas aparecen con el aviso «Bloqueada: volvé a desbloquear» |

Patrón de bloqueo de la casa: **candado + CTA**, nunca ocultar.

---

## 8. Imágenes y fuentes

- **Imágenes:** solo las subidas por el flujo firmado a `ads/…/tenant/<id>/screen`. Al guardar se valida con `adsAssetFromUrl` + `belongsTo` (lo mismo que las ilustraciones de composiciones) y se marcan como guardadas (`markSaved`) para que la limpieza no las borre. Se rechaza una URL pegada de otro sitio o de otro comercio.
- **Foto recortada (sin fondo) — modo híbrido (decisión 24/11):** de entrada todo funciona **sin costo**. Cloudinary pago se suma después con un interruptor, sin cambiar el editor.

  | Nivel | Cómo | Costo | Cuándo |
  |---|---|---|---|
  | **1. PNG ya recortado** | El comercio sube un PNG/WebP con transparencia. El editor **lo detecta** (lee el canal alfa en un canvas: más del 5% de píxeles transparentes en los bordes = recortada) y lo marca «✓ Sin fondo». Si no tiene transparencia, avisa «Esta foto tiene fondo» y ofrece los niveles 2 o 3 | $0 | Fase 2 |
  | **2. «Quitar fondo gratis» en el navegador** | El botón corre un modelo de segmentación **en el dispositivo del usuario** (onnxruntime-web + WebGPU/WASM). El modelo (unos 40–90 MB) se descarga **solo al apretar el botón** y queda en la caché del navegador. El resultado (PNG con alfa) se sube por el flujo firmado de siempre. No usa servidor, ni Cloudinary, ni la TV. Muestra un antes/después, y si el resultado no convence se puede descartar y queda la foto original enmarcada | $0 | Fase 2 |
  | **3. «Quitar fondo HD» con Cloudinary** | Add-on `e_background_removal` de Cloudinary sobre la imagen ya subida, como transformación derivada que se guarda una sola vez. Mejor calidad en bordes difíciles (papas, vapor, pelo) | Por imagen (lo paga la plataforma) | Cuando se active |

  **Reglas del modo híbrido:**
  - **Interruptor:** `DISPLAY_STUDIO_BG_REMOVAL=free|cloudinary|both`, por defecto `free`. Con `free`, el botón HD no aparece.
  - **Tope del nivel 3:** si se activa, `PlatformConfig.displayStudio.bgRemovalMonthlyCap` por comercio (por ejemplo 20 por mes), con un contador en el comercio. Al llegar al tope, el editor ofrece el nivel 2.
  - **Modelo del nivel 2: la licencia se verifica antes de elegirlo.** Tiene que permitir uso comercial en un SaaS (MIT o Apache-2.0, por ejemplo la familia BiRefNet). **Quedan descartados** los modelos o librerías con licencia no comercial (RMBG de Bria) o copyleft de red (`@imgly/background-removal`, AGPL). El modelo se sirve desde el propio dominio (`/models/…`), no desde un CDN externo.
  - **Rendimiento:** en una PC tarda entre 1 y 3 s y en un celular entre 5 y 15 s. Muestra progreso y se puede cancelar. Si el equipo no lo aguanta (sin WebGPU y poca memoria), avisa y ofrece el nivel 1 o 3.
  - **Siempre hay salida:** con foto con fondo, la plantilla usa la variante «enmarcada» (círculo o tarjeta, §9) y nunca queda un rectángulo encima del título.
  - **Privacidad:** en el nivel 2 la foto nunca sale del dispositivo hasta que el usuario la guarda.
- **Fuentes curadas:** lista cerrada de Google Fonts. El servidor las resuelve con `lib/display/fonts.ts` y viajan como archivo. Opción «la de mi marca».
- **Fuente propia `.woff2`** (fase 3):
  - validar los *magic bytes* `wOF2`, que pese 400 KB o menos y que tenga una sola familia;
  - casilla obligatoria «Tengo licencia para usar esta fuente en pantallas»;
  - subida a la carpeta de pantallas del comercio, con un máximo de 5 por comercio;
  - nunca se sirve a otro comercio.

---

## 9. Las 3 plantillas de lanzamiento

Referencias: `PLANTILLA1.PNG`, `PLANTILLA2.PNG` y `PLANTILLA3.PNG`, en la raíz y **fuera del repo**. Llevan textos y marcas de ejemplo de Canva, así que no se commitean: se copian la estructura, la jerarquía, el ritmo y el estilo. No se copian las fotos, las marcas de ejemplo ni las fuentes pagas. Las tres son 4:5; cada una se adapta a **vertical 9:16** (tótem) y **horizontal 16:9** (TV), con el esquema de abajo.

### Requisito común: foto **recortada** (sin fondo)
En las tres, el producto «flota» y se superpone al texto o al plato, así que hace falta un PNG con transparencia. Se resuelve con el **modo híbrido de §8**: PNG propio o «Quitar fondo gratis» en el navegador desde el inicio, y Cloudinary HD cuando se active. Con una foto con fondo, la plantilla pasa sola a la variante **enmarcada** (círculo o tarjeta), sin superponerse al título.

### 9.1 `golden-bites` — Golden Bites (**Free**) · `PLANTILLA1`
- **Estructura (4:5):**
  - fondo crema con textura de papel muy sutil;
  - arriba a la izquierda, el logo y el nombre; arriba a la derecha, la web o el Instagram;
  - título en dos líneas, display sans **muy pesado** (tipo Archivo Black o Anton), en rojo de acento y alineado a la izquierda;
  - bajada de 2–3 líneas debajo;
  - a la derecha, el producto principal recortado, con un segundo producto opcional detrás (bebida o papas);
  - abajo, una **onda/arco de acento** de borde curvo que sube por detrás del producto y lo «apoya».
- **Banda inferior de 3 columnas** sobre el color de acento: «DESCUENTO HASTA / 25%» grande, «Abierto todos los días / 08:00–22:00 / texto», y un recuadro claro con «Pedí online» + un ícono de canal o el **QR de TakeasyGO** (reemplaza los íconos de apps).
- **Campos:**
  - logo, nombre, web/IG;
  - título L1 y L2, bajada;
  - foto principal (recortada) y foto secundaria (opcional);
  - etiqueta de descuento y % (o precio);
  - título del horario, horario y texto del horario;
  - CTA y QR (toggle);
  - color de acento y color de fondo;
  - fuente del título.
- **Vertical 9:16:** la misma pila, con el título más grande, el producto centrado bajo el título y la banda inferior más alta (las 3 columnas pasan a 2 + QR).
- **Horizontal 16:9:** texto a la izquierda (40%), producto a la derecha (60%) sobre el arco, y la banda de 3 columnas a lo ancho.
- **Animación GSAP:**
  - el arco sube desde abajo (0,6 s) y el producto entra escalando con un leve rebote;
  - el título se arma línea por línea (y + opacidad) y después entra la banda;
  - el % hace un *count-up* de 0 a 25 y el QR aparece con un pop;
  - en el loop, el producto flota unos 4 px y el vapor/brillo es opcional.

### 9.2 `cheese-burger` — Cheese Burger (**Premium USD 10**) · `PLANTILLA2`
- **Estructura:**
  - fondo **plano de acento** (naranja en la referencia);
  - la palabra del título repetida en **3 renglones gigantes**, en blanco, condensada y ultra bold (tipo Anton o Bebas), que **se sale de los bordes** (el texto se corta, es intencional);
  - el producto recortado **encima** del texto, centrado y grande;
  - 1–2 «mini productos» decorativos en las esquinas (la misma foto, chica);
  - una píldora con borde blanco arriba con el nombre del local;
  - abajo, 2 columnas de texto en mayúsculas («HASTA 30% OFF / NO TE LO PIERDAS», «TIEMPO LIMITADO», «EN TODAS NUESTRAS BURGERS / PEDÍ YA»).
- **Campos:**
  - nombre del local (píldora);
  - palabra 1 y palabra 2 (los renglones se generan: `PALABRA1 / PALABRA2 (marquesina) / PALABRA2`);
  - foto principal (recortada);
  - mini productos (toggle);
  - 3 textos inferiores, precio opcional, QR (toggle);
  - color de fondo y color del texto.
- **Vertical 9:16:** 4 renglones gigantes y el producto más grande. Abajo, el QR a la derecha en una tarjeta blanca.
- **Horizontal 16:9:** 2 renglones gigantes de lado a lado, el producto al centro y los textos y el QR en una franja inferior.
- **Animación GSAP (lo que justifica el Premium):**
  - el renglón del medio es una **marquesina infinita** (se desplaza horizontalmente en loop) y los otros dos entran de lados opuestos;
  - el producto entra con zoom y rebote fuerte y se queda con una «respiración» suave;
  - los mini productos giran levemente;
  - el precio o el % entra como sello con impacto (escala 1,4 → 1).

### 9.3 `chocolate-croissant` — Chocolate Croissant (**Premium USD 10**) · `PLANTILLA3`
- **Estructura:**
  - fondo crema liso, nombre del local centrado arriba, en serif con mucho tracking;
  - título en dos estilos: palabra 1 en **serif display bold** marrón oscuro (tipo Playfair Display Black) y palabra 2 en **script** en el color de acento (tipo Pacifico o Dancing Script, ambas de Google);
  - **trazos decorativos** (rayitas tipo «brillo») a los costados del título y del plato;
  - la foto principal sobre un plato, centrada y grande;
  - un **sello circular** en el color de acento con un texto script corto («Recién horneado»);
  - abajo, el lema en versalitas con tracking y un ornamento lineal (línea – rombo – línea).
- **Campos:**
  - nombre del local;
  - título palabra 1 (serif) y palabra 2 (script);
  - foto principal;
  - texto del sello y toggle del sello;
  - lema;
  - precio opcional (va dentro del sello o debajo del lema);
  - QR (toggle, discreto, abajo a la derecha);
  - color de acento, color de texto y color de fondo.
- **Vertical 9:16:** el título más grande arriba, el plato al centro, el sello superpuesto arriba a la derecha del plato y el lema + el QR abajo.
- **Horizontal 16:9:** el plato a la izquierda (55%) y, a la derecha, el título, el lema, el sello y el QR apilados y centrados.
- **Animación GSAP:**
  - los trazos decorativos se **dibujan** (stroke-dashoffset en SVG);
  - la palabra script se escribe con un *mask reveal* de izquierda a derecha;
  - el plato baja suave con una sombra que crece;
  - el sello gira y se asienta;
  - en el loop, Ken Burns lento sobre la foto y los trazos titilan cada tanto.

### Elementos decorativos
Los trazos, el arco, el ornamento y el sello son **SVG propios** dibujados en el reproductor, coloreados con el acento y sin assets de Canva. Las fuentes son Google Fonts que viajan como archivo, igual que hoy.

### Miniaturas de la biblioteca
Cada plantilla tiene capturas propias en las dos orientaciones con datos ficticios (`/public/studio/<id>-portrait.webp` y `-landscape.webp`), generadas con el mismo reproductor. No se usan las PNG de referencia.

---

## 10. Seguridad

- **Propiedad:** la compra es por `tenantId`. El manifiesto filtra por el comercio del equipo, y la API de guardado verifica el desbloqueo del mismo comercio de la sesión.
- **Premium:** se controla en **tres lugares**: al guardar, al editar y en el manifiesto. Una pieza vieja con la compra devuelta deja de mostrarse.
- **Webhook:** firma obligatoria si hay secret. El pago siempre se consulta a MP. Es idempotente. No se guardan datos del pagador.
- **Vista previa:** se mantienen la allowlist de `postMessage` y `frame-ancestors`, que ya existen.
- **Firma de contenido del manifiesto:** fase posterior, fuera de este alcance.

---

## 11. Fases

### Fase 1 — Fundación
1. `catalog.ts` con los 3 ids y campos, todavía sin diseño.
2. Modelo `DisplayTemplatePurchase` + `unlockedTemplateIds`.
3. `kind:'studio'` en AppStory, `templates.ts` (unión zod), `manifest.ts` (board + filtro Premium) y las rutas de guardado (402).
4. `purchase.ts` (cambio, checkout, aplicar pago) + las rutas `display-studio`, `checkout`, `confirm` y el webhook.
5. Ruta del SuperAdmin para otorgar/retirar y un botón en la ficha del comercio.
6. `StudioLibrary` con insignias y botón de compra (admin y manager).
7. Comprobante interno numerado + «Mis compras» + email al dueño y al SuperAdmin.
8. **Regresión de MP:** correr los tests existentes de comisiones, split y webhooks antes y después. Tienen que quedar idénticos, sin ningún archivo existente de MP modificado (salvo que se decida lo contrario, revisarlo con `git diff --stat main`).
9. **Tests:**
   - schema de valores;
   - precio y redondeo;
   - cambio sin cotización → 503;
   - `applyTemplatePayment`: aprobado, duplicado, monto corto, moneda distinta, devuelto, referencia ajena;
   - firma válida e inválida;
   - 402 al guardar una Premium bloqueada;
   - el manifiesto oculta una Premium bloqueada.

**Listo cuando:** se puede comprar en sandbox de MP, la plantilla queda desbloqueada a la vuelta (sin esperar al webhook) y el webhook repetido no duplica nada.

### Fase 2 — Editor + primeras plantillas
1. `studio-board.ts` con los 3 renderers, en las dos orientaciones, con GSAP.
2. `StudioEditor` con subida de imagen y logo, detección de transparencia, «Quitar fondo gratis» en el navegador (modelo con licencia comercial verificada), vista previa en vivo y guardar como pieza.
3. Capturas estáticas para la biblioteca (`/public/studio/*.webp`).
4. Tests del reproductor + revisión visual con capturas en 1080×1920, 1920×1080 y 720p.

**Listo cuando:** una Free se personaliza y se publica sin pago, y se ve bien en una TV real en las dos orientaciones.

### Fase 3 — Pulido
1. Fuentes propias `.woff2`.
2. «Quitar fondo HD» con Cloudinary (interruptor + tope mensual), cuando el dueño lo active.
3. `DisplayTemplateOverride` (activar o cambiar precio sin deploy).
4. Ajustes visuales con datos reales.
5. Validación con los 3 comercios piloto (otorgados por el SuperAdmin, sin cobro).
6. Métricas: compras por plantilla y escaneos del QR por pieza `studio` (la atribución ya existe).

---

## 12. Despliegue y vuelta atrás

- **Variables:** `DISPLAY_STUDIO_USD_ARS` es opcional. El secret de webhook de plataforma ya existe en el SuperAdmin. En la app de MP de plataforma hay que permitir la `notification_url` nueva.
- **Interruptor:** `DISPLAY_STUDIO_ENABLED=1`. Sin él, la pestaña no aparece y las rutas devuelven 404. Las piezas `studio` ya guardadas quedan en la base sin mostrarse.
- **Vuelta atrás:** revertir el merge y apagar el interruptor. Las compras quedan en su colección (no se pierde nada pagado) y se reactivan al volver.
- **Orden de deploy:** primero `apps/display` y después `apps/saas`. Antes hay que confirmar que el reproductor **saltea** un `template.kind` que no conoce (hoy no está garantizado: agregar el caso y un test). Así una TV con el reproductor viejo nunca recibe una pieza que no sabe dibujar.

---

## 13. Decisiones del dueño (24/11)

| Tema | Decisión |
|---|---|
| Mercado Pago | Se toca para **agregar** estos cobros. Las credenciales actuales y el split de las comisiones no se tocan y no se pueden romper |
| Cambio | **Dólar automático** (oficial de dolarapi, con respaldo en la última cotización guardada) |
| Quién compra | **Administrador y manager (encargado)** |
| Referencias | `PLANTILLA1` (Golden Bites), `PLANTILLA2` (Cheese Burger), `PLANTILLA3` (Chocolate Croissant), en la raíz y sin commitear |
| Factura | **No por ahora: solo comprobante interno** (§5.7) |

| Quitar fondo | **Híbrido:** de entrada sin costo (PNG recortado + quitar fondo en el navegador). Cloudinary HD se activa con interruptor cuando haga falta (§8) |
