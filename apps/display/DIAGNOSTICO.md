# Diagnóstico de equipos — TakeasyGO Pantallas

Abrí `https://display.takeasygo.com/diagnostico` en cada equipo. Nada se envía
a ningún servidor: al final se copia un informe de texto.

## Pasos en cada equipo

1. Escribí el nombre del equipo (por ejemplo «TV Box sala»).
2. **Con internet**, tocá «1 · Diagnóstico rápido». Baja y reproduce 6 videos
   de muestra (720p y 1080p, de 10, 30 y 60 MB) con las dos opciones de caché.
   El service worker toma el control solo; ya no hace falta recargar antes.
3. Tocá «3 · Pantalla completa y suspensión».
4. **Desconectá internet** y tocá «2 · Probar sin internet». Después
   **recargá la página sin internet**: tiene que volver a abrir.
5. Volvé a conectar internet. Si podés, **reiniciá el equipo**, abrí de nuevo
   `/diagnostico` y corré el paso 2: el informe dice si los datos guardados
   sobrevivieron al reinicio.
6. En los equipos candidatos (TV Box, Chromecast y uno de poca memoria):
   «4 · Prueba larga 2 h» y dejá la pantalla así, sin tocarla ni cambiar de
   pestaña (ver «Prueba larga» abajo).
7. «Copiar informe» y pegalo en el chat.

Si el equipo no es compatible, en lugar de quedar en blanco muestra «Este
equipo no es compatible» con lo que le falta, o «No se pudo iniciar el
reproductor» si el navegador no entiende el código. Anotá el mensaje.

Consumo: cada corrida completa baja ~210 MB de la cuenta ads (una sola vez por
equipo: después quedan guardados). «Borrar videos guardados» libera el espacio.

## Tabla de resultados

Versión probada: `4ed85e41` (antes de las correcciones de esta tanda).

| Equipo | Navegador | Opción B (blob) | Opción A (SW + 206) | Persistente | Pantalla completa / suspensión | Prueba larga | Veredicto |
|---|---|---|---|---|---|---|---|
| IdeaPad S340 (Windows, 4 núcleos) | Chrome 157 | 6/6 OK · cuadros perdidos 0–0,3 % · primer cuadro 58–116 ms · 1 corte por prueba (era el salto, ver abajo) · salto 16–326 ms | FALLA: error del service worker (no era una falla del equipo) | Sí (10,19 GB libres) | Sí / sí | Solo 7 min: sin conclusiones | **Apto** (falta la prueba larga) |
| IdeaPad → TV BGH 43 por HDMI | Chrome 157 · 1281×720 @1,5x (1921×1080 reales) | 6/6 OK · cuadros perdidos 0–1,1 % (1,1 % en 1080p/60 MB) · 1 corte | FALLA (mismo error del SW) | No (en otras corridas sí) | — | — | **Apto**. El reproductor corre en la notebook; la TV solo muestra la imagen |
| Motorola (Android 10, 8 núcleos) | Chrome 158 · vertical 509×1124 @2,125x | 6/6 reproducen, en ATENCIÓN · cuadros perdidos 0,4–1,2 % · 2 cortes (3 en una prueba) · saltos de ~1020 ms en las tres de 720p y 4632 ms en 1080p/30 MB · descarga a 240–430 Mbps | FALLA (mismo error del SW) | Sí | — | — | **Probablemente apto**: repetir con la versión nueva para separar los cortes por motivo |
| TV BGH B3219K5 (navegador integrado) | Navegador propio (software de 12/2020, kernel 3.10.86, Cortex-A53 1,1 GHz, Mali-470, 768 MB de RAM) | No abre: pantalla en blanco | — | — | — | — | **No compatible** |
| TV Box Android | pendiente | | | | | | |
| Chromecast con Google TV o similar | pendiente | | | | | | |
| Equipo de poca memoria (prueba de 2 h) | pendiente | | | | | | |

### Qué fueron los resultados raros

- **Opción A, FALLA en los tres equipos.** El service worker publicado nunca
  se instalaba: la lista de archivos a guardar traía `icon.svg` dos veces y
  `cache.addAll()` rechaza la lista entera si hay repetidos. El mensaje
  «todavía no controla la página» era la consecuencia. Lo reproduje con Chrome
  sin interfaz contra display.takeasygo.com (sin control incluso después de
  recargar) y con la versión corregida en local (controla en la primera
  visita y después de una recarga forzada).
- **«1 corte» en casi todas las pruebas.** El contador sumaba cualquier
  `waiting` después del primer cuadro, incluido el que provoca el propio
  salto al 50 % de la prueba. Era un corte de la prueba, no del equipo.
- **Saltos de ~1020 ms en las tres de 720p (Motorola).** Las tres muestras de
  720p tienen los mismos cuadros clave: el anterior al 50 % (segundo 30) está
  en el 23,7. Para mostrar el segundo 30 el equipo decodifica ~6 s de video
  (~190 cuadros) sin mostrarlos. Por eso tarda casi lo mismo en las tres. En
  la notebook lo mismo tarda 16–326 ms. Mide potencia de decodificación, y el
  reproductor real nunca salta: es informativo.
- **Salto de 4632 ms en 1080p/30 MB (Motorola).** En esa muestra hay un cuadro
  clave en el 29,7, así que no es por decodificar de más. Con los datos de
  esa versión no se puede saber qué fue (reinicio del decodificador, la
  pestaña en segundo plano, una pausa del sistema). Ahora el informe lista
  cada corte con su instante, duración y motivo; hay que repetir la prueba.

### Verificación del aislamiento de /diagnostico (Chrome local, sin interfaz)

- **Cloudinary no se bloquea**. Con COOP/COEP (`credentialless`):
  - la descarga CORS completa da 9.955.378 bytes;
  - reproduce desde blob (opción B) y también directo desde Cloudinary;
  - la memoria de la página se mide: `crossOriginIsolated = true`.
- **El reproductor no queda afectado**. En `/` no hay aislamiento
  (`crossOriginIsolated = false`) y la raíz publicada no manda esos
  encabezados. El service worker no guarda la respuesta aislada de
  `/diagnostico` como copia sin internet. La API acepta el origen
  `display.takeasygo.com`.
- **Opción A**: en esa misma prueba local el service worker guarda el video
  y responde bien a pedidos con Range (206 con `Content-Range`), pero el
  `<video>` no reproduce la respuesta (MEDIA_ERR_SRC_NOT_SUPPORTED). Falla
  igual **con y sin aislamiento**, así que no es por COOP/COEP. Hay que
  confirmarlo en los equipos. El reproductor usa la opción B, que no depende
  de esto.

## Qué mide cada cosa (versión nueva)

- **Corte**: evento `waiting` del video, es decir, se quedó sin cuadros y se
  detuvo esperando. Es lo que el público ve. Su duración es el tiempo hasta
  que vuelve a `playing`. Cada corte sale en el informe con su motivo:
  - **equipo**: el único que cuenta para el veredicto.
  - **salto de la prueba**: durante el salto al 50 % (o el regreso al inicio
    del bucle en la prueba larga) o en el segundo siguiente.
  - **pantalla oculta**: con la pestaña oculta o en el segundo siguiente a
    volver.
- **stalled**: el navegador no recibió datos del archivo durante ~3 s. Con un
  video local puede aparecer sin que la imagen se detenga: se informa y no
  cuenta.
- **Pausa real**: el video quedó en pausa porque la pidió el sistema o el
  usuario (`paused = true`). En un corte el video no está en pausa: está
  esperando. Una pausa real pone la prueba en ATENCIÓN.
- **Salto al 50 %**: tiempo entre pedir el salto y `seeked`. Informativo.
- **Memoria**: `performance.memory` es solo el heap de JavaScript de la
  página, redondeado por el navegador. Por eso daba «1→1 MB». No incluye el
  video. Ahora:
  - `/diagnostico` se sirve aislado (COOP/COEP) para que Chrome mida con
    `measureUserAgentSpecificMemory()`: JavaScript + DOM, más preciso.
  - Tampoco incluye el video. El decodificador y sus búferes viven en otro
    proceso y ninguna API web los mide.
  - El informe dice siempre qué fuente usó. Ya no se muestra por prueba corta.
  - La falta de memoria de verdad se ve en la prueba larga: la página se
    recarga sola, el video se congela o aparecen errores.
- **memoriaDelEquipoGB** (`navigator.deviceMemory`): el navegador la limita
  por privacidad (tope 8 GB, redondeada). Figura en el informe solo como dato:
  no se usa para decidir nada. El reproductor ya no la usa para elegir la
  calidad.

## Prueba larga (2 h)

Qué registra, minuto a minuto:
- memoria y su fuente;
- cuadros mostrados y perdidos;
- cortes del equipo y su duración;
- si el video se **congeló**: no avanzó ≥ 10 s sin estar en pausa ni oculto;
- si la pantalla estuvo oculta.

Guarda un punto de control por minuto. Si la página se recarga o se cierra en
el medio (falta de memoria, reinicio del navegador o del equipo), al volver a
abrir `/diagnostico` el informe la marca **INTERRUMPIDA** y dice después de
qué minuto.

Cómo se compara entre equipos (misma muestra, 720p 30 MB y 1080p 30 MB):

| Métrica | Aprobado | ATENCIÓN | FALLA |
|---|---|---|---|
| Minutos completados | 120 de 120 | menos de 120 sin interrupción | interrumpida (recarga o cierre) |
| Congelamientos | 0 | — | ≥ 1 minuto congelado |
| Errores de reproducción | 0 | — | ≥ 1 |
| Cortes del equipo | ≤ 1 por hora | > 1 por hora | — |
| Cuadros perdidos | ≤ 1 % | > 1 % | — |
| Memoria (pendiente entre los primeros y los últimos 10 min) | ≤ 50 MB/h | > 50 MB/h | — |
| Pantalla oculta | 0 min | > 0 (la prueba no es válida: repetir) | — |

La pendiente de memoria solo se compara entre equipos que informen la misma
fuente. Si un equipo no informa memoria, valen los otros criterios.

## Cómo se decide

- **Opción elegida: B (blob)**. Ya reproduce sin errores en los tres equipos
  con Chrome, es la que usa el reproductor y no depende del service worker
  para los videos. La opción A queda solo en `/diagnostico` como referencia.
- **Freno**: si en el TV Box ni A ni B funcionan, o 720p no es fluido.
  Todavía no hay informe del TV Box.
