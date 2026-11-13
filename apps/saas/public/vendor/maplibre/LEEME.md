# Worker de MapLibre

El mapa de `/app` (components/city/CityMap.tsx) usa MapLibre GL. La librería
necesita un archivo «worker» aparte y el empaquetador de Next no lo resuelve
solo, así que se sirve desde acá, en una carpeta con el número de versión:

    public/vendor/maplibre/<versión>/maplibre-gl-worker.mjs

## Al actualizar `maplibre-gl`

Copiar el worker de la versión nueva (y borrar la carpeta vieja):

    cp node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs public/vendor/maplibre/<versión>/

Si falta, el mapa no carga. El test `__tests__/lib/city-map-worker.test.ts`
falla cuando la versión instalada no tiene su carpeta.
