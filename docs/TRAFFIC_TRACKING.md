# Tracking de Fuentes de Tráfico

## Resumen
El sistema ahora detecta y registra la fuente de tráfico de cada visita al menú de los tenants.

## Cómo funciona

### Detección automática
El sistema detecta la fuente en este orden de prioridad:

1. **Parámetro URL** (`?source=xxx`) - Mayor prioridad
2. **User-Agent** - Detecta Instagram in-app browser
3. **Referer header** - Detecta origen de la visita
4. **Sin referer** - Marca como "directo"

### Fuentes soportadas

| Fuente | Detección | Icono |
|--------|-----------|-------|
| `instagram` | URL param, User-Agent o Referer | Instagram |
| `facebook` | URL param o Referer | Mensaje |
| `qr` | URL param | QR Code |
| `whatsapp` | URL param o Referer | Mensaje |
| `google` | URL param o Referer | Búsqueda |
| `direct` | Sin referer | Cursor |
| `other` | Otros casos | Globo |

## Uso para Tenants

### Instagram
Para trackear visitas desde Instagram, el tenant debe usar:
```
https://takeasygo.com/cero-cafe/menu/69a658edca4b0421ca9773e8?source=instagram
```

### QR Code
Para trackear visitas desde un QR, usar:
```
https://takeasygo.com/cero-cafe/menu/69a658edca4b0421ca9773e8?source=qr
```

### Facebook
```
https://takeasygo.com/cero-cafe/menu/69a658edca4b0421ca9773e8?source=facebook
```

### WhatsApp
```
https://takeasygo.com/cero-cafe/menu/69a658edca4b0421ca9773e8?source=whatsapp
```

## Panel de Superadmin

Acceder a `/superadmin/visitas` para ver:

- **Resumen de fuentes**: Contadores por cada fuente de tráfico
- **Detalle por tenant**: Expande cada tenant para ver las visitas individuales con su fuente
- **Filtros**: Por período (7, 30, 90 días) y por tenant específico

## Datos guardados

Cada visita guarda:
- `source`: Fuente detectada (instagram, qr, etc.)
- `referrer`: URL completa del referer (si existe)
- `locationPath`: Path de la URL visitada
- `deviceType`: mobile/desktop/unknown
- `ip`, `userAgent`, `visitedAt`

## Ejemplo de URLs para compartir

```
# Link para Instagram
https://takeasygo.com/cero-cafe/menu/69a658edca4b0421ca9773e8?source=instagram

# Link para QR (impreso en mesas)
https://takeasygo.com/cero-cafe/menu/69a658edca4b0421ca9773e8?source=qr

# Link para WhatsApp Business
https://takeasygo.com/cero-cafe/menu/69a658edca4b0421ca9773e8?source=whatsapp

# Link normal (se detectará como directo u otro)
https://takeasygo.com/cero-cafe/menu/69a658edca4b0421ca9773e8
```

## Notas

- Si un usuario llega desde el navegador interno de Instagram, se detecta automáticamente
- Los parámetros `?source=` no afectan la funcionalidad del menú
- Los datos comienzan a registrarse desde la fecha de implementación
