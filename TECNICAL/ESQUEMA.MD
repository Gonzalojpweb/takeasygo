TakeasyGO — Definición final del proyecto (Iteración actual)
1. Qué es TakeasyGO (definición clara)

TakeasyGO es una infraestructura digital para restaurantes que venden takeaway.

Tiene dos capas:

Capa 1 — SaaS (producto base)

Sistema para que restaurantes tengan:
menú digital
pedidos takeaway
pagos online
gestión de órdenes
analytics

Esto es lo que vende directamente a restaurantes.

Capa 2 — Red TakeasyGO (futuro)

Cuando muchos restaurantes usan el sistema, se crea una red de restaurantes preparados para takeaway optimizado.

Ahí aparece:

radar de restaurantes
algoritmo de visibilidad justo
pedidos basados en cercanía + capacidad real
Esto es lo que genera la plataforma / fenómeno.

2. Principio del proyecto

El proyecto no intenta competir con delivery.
Busca resolver una fricción estructural:
El takeaway hoy está desorganizado.

Los clientes no saben:

qué restaurantes aceptan takeaway
cuánto tardan
si están cerca
si pueden pedir sin apps de delivery

TakeasyGO organiza eso.

3. Arquitectura del producto

Fase 1 — Infraestructura (SaaS)
Producto actual.

Funciones:

menú digital
órdenes
pagos
panel admin
analytics

Cliente: restaurante.

Fase 2 — Inteligencia operativa
Se agregan métricas reales del restaurante.

Esto alimenta:
tiempos reales
comportamiento de clientes
eficiencia del restaurante
Esto construye el score operativo.

Fase 3 — Red TakeasyGO
Cuando hay suficientes restaurantes:

se habilita:
radar takeaway
ranking operativo
descubrimiento de restaurantes

Cliente: consumidor.

4. Modelo de negocio
Inspirado relacionado al concepto de Geofencing Urbano y proximidad real se basa en el trabajo es una idea de la Ciudad de los 15 Min de Carlos Moreno:
Consiste en crear un modelo de ciudad descentralizada, policéntrica y multiservicial, en la que los ciudadanos solo tengan que desplazarse durante un cuarto de hora para satisfacer sus necesidades esenciales. 

‘La ciudad de los 15 minutos’ es la síntesis científica de tres vertientes: un ritmo de vida en la ciudad más calmado (cronourbanismo), la reutilización intensa de los espacios (cronotopía) y la apropiación de lugares por parte de los ciudadanos (topofilia). Ya no estamos en la lucha por el derecho a un lugar en la ciudad, estamos luchando por el derecho a una mejor vida urbana.

La referencia técnica es el Hyperlocal E-commerce

La **Lógica de Disponibilidad Dinámica** viene de la escuela de hotelería y aviación de la **Universidad de Cornell (Sheryl E. Kimes)**. Ellos crearon el concepto de *Restaurant Revenue Management*.

- **La referencia:** El estudio de cómo manejar la "duración del servicio" y la "incertidumbre de la demanda".
- **Por qué está bien:** En lugar de aceptar pedidos hasta colapsar (el error de las apps actuales), aplicamos **Throttling** (estrangulamiento de flujo), una técnica de ingeniería de software para proteger sistemas bajo carga.

 el software debe servir al negocio, no al revés.

El modelo mezcla:

1️⃣ suscripción SaaS
2️⃣ comisión por orden

Plan SaaS

Ejemplo posible:

Plan Base
USD 30 / mes

Incluye:

menú digital
órdenes
panel
analytics básicos
Comisión por orden

Modelo de 5 niveles inspirado en OrderYoyo.

Nivel	Ventas mensuales	Comisión
Nivel 1	hasta 300 órdenes	9%
Nivel 2	300–600	8%
Nivel 3	600–1000	7%
Nivel 4	1000–2000	6%
Nivel 5	+2000	5%

Principio:

cuanto más vende el restaurante, menos paga.
Esto alinea incentivos.

5. KPI del sistema (estructura final)
Hay 3 capas de métricas.

KPI capa 1 — Operación del restaurante
Para el admin del restaurante.

Ventas:
revenue total
órdenes totales
ticket promedio
crecimiento MoM

Eficiencia
tasa de cancelación
tiempo promedio de preparación
tiempo promedio hasta retiro

Clientes
clientes únicos
clientes recurrentes
tasa de recurrencia

Menú
items más vendidos
revenue por item
popularidad por categoría

Operación temporal
órdenes por hora
órdenes por día
picos de demanda

KPI capa 2 — Inteligencia operativa
Estos alimentan el algoritmo.

No todos son visibles.

Métricas
tiempo medio de preparación (tpp)
consistencia del tiempo
ratio de cancelación
densidad de pedidos por hora
capacidad operativa estimada

KPI capa 3 — Plataforma (superadmin)
Para TakeasyGO.

Plataforma
tenants activos
órdenes totales
revenue total
ticket promedio global

Red
restaurantes activos
ciudades activas
órdenes por ciudad

Crecimiento
nuevos restaurantesy
leads
conversión leads → clientes

6. Score operativo

Esto es clave.
El Score Operativo TakeasyGO mide qué tan confiable es un restaurante para takeaway.

No mide popularidad.

Mide capacidad real.
Variables del score

Ejemplo:

Score =
(Preparación 35%)
+ (Consistencia 25%)
+ (Cancelaciones 20%)
+ (Volumen sostenible 10%)
+ (Experiencia cliente 10%)

Preparación:
tiempo medio real.

Consistencia:
variación de tiempos.

Cancelaciones:
ratio cancelaciones / órdenes.

Volumen sostenible:
si soporta la demanda.

Experiencia cliente:
tiempo total.

7. Algoritmo de visibilidad
Esto es el corazón de la futura red.

El algoritmo no muestra restaurantes por:

publicidad
pago
ranking social

Se basa en:

1 Cercanía1:
distancia real al usuario.

2 Tiempo estimado:
preparación + caminata.

3 Capacidad actual:
si el restaurante puede aceptar pedidos.

4 Score operativo:
confiabilidad histórica.


Fórmula conceptual:

VisibilityScore =
0.35 * distance_score
+ 0.30 * prep_time_score
+ 0.20 * capacity_score
+ 0.15 * operational_score


8. Diferencia con marketplaces actuales

Apps actuales:

venden visibilidad
ranking por pago
saturación de restaurantes

TakeasyGO propone:

visibilidad operativa
el mejor restaurante en ese momento.

9. Filosofía del sistema
Esto es importante para tu producto.

TakeasyGO no intenta ser:

red social
marketplace agresivo
app de delivery

Es:

infraestructura para takeaway directo.

10. Lo que ya tienes construido

Tu SaaS ya tiene:
sistema de órdenes
estados
historial
export
analytics
revenue
ticket
top items
auditoría
logs
eventos
multi tenant
superadmin
tenants

Esto es muy bueno para etapa inicial.


11. Lo que debes agregar ahora (KPIs faltantes)

Estas son las features prioritarias.

1..... Tiempo de preparación
Nuevos campos en order:

confirmedAt
preparingAt
readyAt
pickedUpAt

Permite calcular:

tiempo de preparación
tiempo total

2..... Tasa de cancelación:
cancelled_orders / total_orders


3.... Órdenes por hora
Agrupar:

createdAt -> hour

4.... Revenue por sede
Agrupar por:

locationId

5.... Retención clientes
Agrupar por:

customer.email
customer.phone

6.... Conversión pagos
paid_orders / total_orders


12. Roadmap inicial
Etapa 1 — Consolidar SaaS

Objetivo:

10–30 restaurantes activos.

Mejorar:
KPIs
estabilidad
onboarding

Etapa 2 — Inteligencia operativa

Implementar:
tiempos
score
capacidad

-----Etapa 3 — Radar Takeaway

Primera versión del mapa.

-----Etapa 4 — Red completa

Descubrimiento público.



13. Qué mostrar en el ROOT del sitio

Esto es importante para atraer restaurantes.

No prometer.
Pero insinuar.
Ejemplo:

Takeaway infrastructure
TakeasyGO helps restaurants manage their takeaway operations and prepares them to be part of a smarter network of local pickup.

Otro bloque:
More than a menu

Restaurants using TakeasyGO are building the infrastructure for a new way to discover takeaway — based on real preparation time, proximity and operational reliability.

Y una frase fuerte:
Every restaurant using TakeasyGO contributes to a future network of real-time takeaway.

Eso genera curiosidad.

14. Estrategia que definiste

Tu decisión final fue:

✔ primero fortalecer el SaaS
✔ recolectar datos reales
✔ luego lanzar la red

Esto es exactamente lo correcto.

15. Evaluación honesta de tu proyecto

Te soy brutalmente honesto.
Tu proyecto tiene tres cosas muy fuertes:

1 infraestructura real
No estás construyendo humo.

2 problema concreto
Takeaway desorganizado.

3 modelo escalable
SaaS + red.

Tu mayor riesgo no es técnico.

Es:

no enfocarte en la primera etapa.|