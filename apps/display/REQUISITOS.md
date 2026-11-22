# Requisitos de equipo — TakeasyGO Pantallas (propuesta para la documentación del comercio)

Basado en las pruebas de `/diagnostico` (ver DIAGNOSTICO.md). Solo se afirma
que funciona lo que se probó.

## Requisitos mínimos

> **Sin validar**: los requisitos de navegador y de memoria son una propuesta,
> no una garantía, hasta tener el informe del TV Box (y la prueba larga en un
> equipo de poca memoria). No los publiques como requisitos firmes antes.

| | Mínimo | Recomendado | De dónde sale |
|---|---|---|---|
| Navegador | **Sin validar**: Google Chrome o navegador basado en Chromium, actualizado | La última versión de Chrome | Probado solo en Chrome 157 (Windows) y 158 (Android). La versión técnica mínima es Chrome 80 (el código usa módulos de JavaScript, Cache Storage y sintaxis ES2019), pero **no se probó** por debajo de 157 |
| Memoria (RAM) | **Sin validar**: 2 GB | **Sin validar**: 4 GB o más | Sin informe del TV Box ni prueba larga en un equipo de poca memoria. Único dato: con 768 MB (TV BGH) ni siquiera abre |
| Espacio libre | 4 GB | 8 GB o más | Los videos se guardan en el equipo; el tope por comercio es 1,5 GB, más margen del navegador |
| Video | H.264 (MP4) por hardware; 720p fluido | 1080p fluido en pantallas Full HD | El reproductor elige 720p si la pantalla mide menos de 1920 px reales, o si el navegador dice que 1080p no es fluido |
| Conexión | Para la primera descarga y las novedades | Wi-Fi estable o cable | Sin internet reproduce lo ya guardado |
| Pantalla | HDMI a la TV o pantalla propia | — | — |

Sugerencias para el comercio:
- **Instalar la página como app** (Chrome → menú ⋮ → «Instalar»). Así Chrome
  marca el almacenamiento como persistente y no borra los videos guardados
  cuando le falta espacio. Sin eso funciona igual, pero si el navegador borra
  lo guardado, la pantalla lo vuelve a bajar. En el peor caso, si borra
  todos los datos del sitio, hay que vincularla de nuevo.
- Desactivar el ahorro de energía o la suspensión de pantalla del equipo.

## Equipos recomendados

| Tipo | Estado |
|---|---|
| **PC o notebook con Chrome**, conectada a la TV por HDMI | **Probado**: IdeaPad S340 con Chrome 157, sola y conectada a una TV BGH 43 (6/6 videos OK) |
| **TV Box Android con Chrome** (Android 9 o superior; RAM sin validar, se propone 2 GB o más) | **Sin probar**: pendiente el informe |
| **Dispositivo tipo Chromecast con Google TV** | **Sin probar**. Ojo: no trae Chrome; hace falta un navegador basado en Chromium o una app de kiosco web, y hay que verificarlo con `/diagnostico` |
| Celular o tablet Android con Chrome | Probado como referencia (Motorola, Android 10): reproduce; falta repetir con la versión nueva |

**No sirven**: los navegadores que vienen integrados en televisores viejos.
Por ejemplo, la TV BGH B3219K5 (software de 2020, 768 MB de RAM) queda en
blanco. Ahora el reproductor muestra un mensaje en lugar de una pantalla vacía.
Para esas TV: usar una PC o un TV Box por HDMI.

Antes de comprar o instalar un equipo nuevo: abrir
`display.takeasygo.com/diagnostico` y correr el diagnóstico rápido.
