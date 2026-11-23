# Pantallas — plan: contexto, red publicitaria, equipos y escala

Estado y propuesta del bloque «Pantallas que reaccionan al contexto» y
«Plataforma y red». Sin plazos. Los costos se marcan como **a cotizar**
cuando dependen de precios de terceros que cambian: no se inventan números.

## 1. Pantallas que reaccionan al contexto

| Señal | Estado | Cómo |
|---|---|---|
| Hora y día | **Hecho** | Franja horaria por pieza; horarios de la carta y de las promos evaluados en la pantalla, también sin internet |
| Stock | **Hecho** | Pausado manual o por stock → desaparece o «Agotado» en la carta; fuera de «Lo más pedido» |
| Lo que más se vende en la sede | **Hecho** | «Lo más pedido»: ranking de 14 días por sede (solo conteos), destacados y combos |
| QR a pedir con atribución | **Hecho** | `?source=pantalla.<id>` + reporte por pantalla y por sede cruzado con reproducciones |
| Clima | Propuesta | Reglas simples que arma el comercio («si llueve o hace menos de 12 °C, mostrar Sopas»). El servidor consulta el clima por sede cada hora y lo manda en el manifiesto; la pantalla aplica la regla. Solo viajan las coordenadas del local, nunca datos de clientes. **Decisión tuya:** proveedor (Open-Meteo pide plan pago para uso comercial; otros piden clave). **A cotizar** |
| Ocupación del local | Propuesta | Contar mesas ocupadas de la sede **solo lectura** (colección de mesas, sin escribir nada) y ofrecer reglas («salón lleno → promo para llevar»). No toca el POS ni el Sync Layer, pero lee datos que escribe el POS: **necesita tu OK** |
| Pantalla táctil | Propuesta | Tocar un producto lo agranda y muestra el QR para pedirlo; vuelve sola a los segundos. Sin cuentas ni datos personales en la pantalla |

La regla de contexto se implementa como **una condición más de cada pieza**
(igual que la franja horaria): sin IA, visible y editable por el comercio.

## 2. Red publicitaria de proximidad

Ya existen las bases: superficie `screen`, pieza con dueño (`owner.kind`),
estadísticas por pieza con descarte de valores imposibles y lotes sin
repetir, métricas en el panel.

Lo que falta y **decisiones tuyas** antes de construir:

1. **Levantar la regla «solo contenido propio».** Hoy el manifiesto filtra
   `owner.kind = 'tenant'` a propósito.
2. **Quién vende y quién aprueba:** anunciante → TakeasyGO aprueba la pieza
   (flujo de aprobación) → el comercio acepta o bloquea rubros (por ejemplo,
   nada de competencia directa ni alcohol).
3. **Reparto:** porcentaje para el comercio por reproducción válida y cómo se
   le liquida (saldo a favor en la factura del plan o transferencia). Va por
   fuera de la comisión de pedidos.
4. **Prueba de reproducción auditable:** hoy el lote de estadísticas es
   confiable pero no firmado. Para cobrar a terceros: lote firmado por equipo
   (clave propia del dispositivo), muestreo de capturas opcional y reporte
   exportable por campaña.
5. **Topes por pantalla:** cuánto del bucle puede ser publicidad (sugerido:
   1 de cada 4 piezas) para que la pantalla siga siendo del comercio.
6. **Facturación al anunciante** y condiciones legales: **a definir con tu
   contador o abogado.**

## 3. Equipos certificados

| Plataforma | Cómo | Notas |
|---|---|---|
| Android TV / TV Box / Google TV | App propia que abre el reproductor a pantalla completa, arranca con el equipo y se reabre si se cierra | La más directa; distribución por Play Store o instalación directa |
| Fire TV | La misma app (Android) publicada en Amazon Appstore | Cuenta de desarrollador de Amazon |
| Tizen (Samsung) / webOS (LG) | App web empaquetada para cada tienda | Cuenta de desarrollador y revisión de cada fabricante; solo modelos recientes |
| TV viejo con navegador integrado | No se resuelve con app | La TV BGH de 2020 (768 MB) no corre ni el reproductor: para esas, TV Box por HDMI |

Primero la app Android (cubre TV Box, Google TV y Fire TV). Certificar =
correr `/diagnostico` + prueba larga de 2 h y publicar la lista en
REQUISITOS.md. **Bloqueante:** sigue pendiente el informe del TV Box.

## 4. Administración remota a escala

- **Grupos de pantallas** (por sede, por zona, por tipo) para asignar piezas
  a un grupo en lugar de pantalla por pantalla.
- **Alertas:** pantalla sin latido, almacenamiento borrado por el navegador,
  errores de reproducción seguidos → aviso al comercio (panel, correo o
  WhatsApp según su plan).
- **Acciones remotas:** recargar, borrar lo guardado y volver a bajar, cambiar
  orientación; viajan en el manifiesto (la pantalla ya lo consulta cada
  minuto) y quedan en auditoría.
- **Sincronización entre pantallas** (la misma pieza al mismo tiempo en
  varias): con la hora corregida que ya tiene cada equipo, arrancar el bucle
  en múltiplos fijos de tiempo.
- **Actualizaciones:** ya automáticas (versión nueva → recarga al terminar la
  pieza). Falta poder publicar por etapas (un % de pantallas primero).

## 5. Infraestructura para millones de reproducciones

- **Las reproducciones no generan tráfico de video:** cada pantalla baja el
  archivo una vez y lo reproduce desde el equipo. El costo crece con
  pantallas × piezas nuevas, no con reproducciones.
- **Las estadísticas ya están agregadas** (un documento por pieza, sede y
  día). Con millones de reproducciones crece poco.
- **Video:** hoy Cloudinary (cuenta ads) genera la versión 720p/1080p y la
  entrega. Cuando el costo de transformación y tráfico pese, se pasa a
  almacenamiento de objetos + CDN (por región), y se transcodifica una sola
  vez al subir. Precios **a cotizar** según volumen.
  - Ya preparado: `screenUrls()` (lib/media/ads.ts) arma las URLs y la caché
    del reproductor trabaja con cualquier URL con CORS. Cambiar de proveedor
    toca esas funciones, no el motor.
  - Qué medir antes de decidir: GB entregados por mes por la cuenta ads y
    transformaciones de video (panel de Cloudinary), pantallas activas y
    piezas nuevas por mes.

## Orden sugerido

1. Contexto por clima y ocupación (cuando confirmes proveedor y la lectura de mesas).
2. Táctil.
3. Administración remota (grupos y alertas): se necesita antes de tener muchas pantallas.
4. App Android certificada (después del informe del TV Box).
5. Red publicitaria (después de tus decisiones del punto 2).
6. Migración de video (cuando lo justifique lo medido).
