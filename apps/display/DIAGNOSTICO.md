# Diagnóstico de equipos — TakeasyGO Pantallas

Abrí `https://<dominio del reproductor>/diagnostico` en cada equipo (Chrome en
Windows y Android; el navegador que traiga el TV Box y la TV BGH). Nada se
envía a ningún servidor: al final se copia un informe de texto.

## Pasos en cada equipo

1. Escribí el nombre del equipo (por ejemplo «TV Box sala» o «TV BGH 43»).
2. **Con internet**, tocá «1 · Diagnóstico rápido». Baja y reproduce 6 videos
   de muestra (720p y 1080p, de 10, 30 y 60 MB) con las dos opciones de caché.
   Si es la primera vez, **recargá la página una vez** antes, para que el
   service worker controle la página (la opción A lo necesita).
3. Tocá «3 · Pantalla completa y suspensión».
4. **Desconectá internet** (Wi-Fi o cable) y tocá «2 · Probar sin internet».
   Después **recargá la página sin internet**: tiene que volver a abrir.
5. Volvé a conectar internet. Si podés, **reiniciá el equipo**, abrí de nuevo
   `/diagnostico` y corré el paso 2: el informe dice si los datos guardados
   sobrevivieron al reinicio.
6. Opcional pero importante en el TV Box y la TV: «4 · Prueba larga 2 h» y
   dejá la pantalla así. Mide la memoria minuto a minuto y los cortes.
7. «Copiar informe» y pegalo en el chat.

Consumo: cada corrida completa baja ~210 MB de la cuenta ads (una sola vez por
equipo: después quedan guardados). «Borrar videos guardados» libera el espacio.

## Tabla de resultados (se completa con los informes)

| Equipo | Navegador / versión | Memoria | H.264 1080p | Opción A (SW + 206) | Opción B (blob) | 720p fluido | Sin internet | Vence por endsAt | Persistente / espacio | Pantalla completa / suspensión | Memoria 2 h | Veredicto |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PC Windows | | | | | | | | | | | | |
| Android (celular o tablet) | | | | | | | | | | | | |
| TV Box Android | | | | | | | | | | | | |
| TV BGH | | | | | | | | | | | | |

## Cómo se decide

- **Opción elegida**: la que reproduzca sin errores, con ≤ 5 % de cuadros
  perdidos y sin cortes en los cuatro equipos. Si las dos sirven, B (blob) por
  ser más simple y no depender del service worker para los videos.
- **Freno**: si en el TV Box ni A ni B funcionan, o 720p no es fluido.
