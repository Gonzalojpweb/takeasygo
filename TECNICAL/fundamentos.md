# Ley de Goodhart

Charles Goodhart

Economista británico.

La ley dice:

> Cuando una medida se convierte en objetivo deja de ser una buena medida.
> 

Aplicación en delivery:

Si el restaurante sabe que el algoritmo mide:

“tiempo de preparación”

entonces puede **mentir en el estado del pedido**.

Eso optimiza la métrica sin mejorar la operación.

TakeasyGO evita esto midiendo:

- timestamps reales
- consistencia
- desviación

---

# Teorema Central del Límite (CLT)

Central Limit Theorem

Base de la estadística moderna.

Dice que:

cuando el tamaño de muestra crece

la media se vuelve estadísticamente estable.

Por eso:

TakeasyGO usa:

- mínimo **30 pedidos** para validez estadística.

Esto es estándar en:

- Six Sigma
- análisis industrial
- investigación científica.

---

# Coeficiente de Variación

- Coefficient of Variation
    
    ## **Coefficient of Variation**
    
    El **coeficiente de variación** (CV) es una medida estadística que expresa la dispersión relativa de un conjunto de datos respecto a su media. Se define como la razón entre la desviación estándar y la media, y se multiplica por 100 para obtener un porcentaje.
    
    El CV es útil porque permite comparar la variabilidad entre conjuntos de datos con unidades o magnitudes diferentes, siendo ampliamente empleado en finanzas, biología, ingeniería y control de calidad.
    
    ### **Hechos clave**
    
    - **Fórmula:** CV = (desviación estándar / media) × 100
    - **Unidad:** porcentaje (%), adimensional
    - **Uso principal:** comparación de la variabilidad relativa
    - **Valor bajo:** menor dispersión, mayor consistencia
    - **Valor alto:** mayor dispersión, menor estabilidad
    
    ### **Interpretación**
    
    El coeficiente de variación cuantifica la estabilidad de un conjunto de datos: un CV bajo indica que los valores están más concentrados alrededor de la media, mientras que un CV alto sugiere una mayor variabilidad. Es especialmente valioso para comparar riesgos o incertidumbres relativas, por ejemplo, entre inversiones con diferentes rendimientos promedio.
    
    ### **Aplicaciones comunes**
    
    En finanzas, el CV se usa para evaluar la relación entre riesgo y retorno de activos. En ciencias naturales y experimentales, permite comparar mediciones con diferentes unidades o escalas. En control industrial, ayuda a monitorear la consistencia de procesos y productos a lo largo del tiempo.
    
    ### **Limitaciones**
    
    El coeficiente de variación solo tiene sentido cuando la media es positiva y significativa. Si la media se acerca a cero, el CV puede volverse inestable o indefinido. Además, no reemplaza otras medidas de dispersión absoluta cuando se requiere información en las unidades originales de los datos.
    

Se usa para medir **consistencia relativa**.

Fórmula:

```
CV = desviación estándar / media
```

Aplicación:

Si dos restaurantes tienen promedio 15 minutos:

A:

15,16,15,14,15

B:

5,30,2,40,15

Ambos promedian 15.

Pero el segundo es **caótico**.

El CV detecta eso.

Por eso el ICO mide **consistencia**, no solo promedio.

---

# Bayesian Smoothing

Bayesian Inference

Se usa cuando hay **pocos datos**.

Empresas que lo usan:

- Amazon
- Netflix
- Airbnb

Sirve para evitar:

"restaurante con 1 pedido = score perfecto".

---

# Market Design

- Market Design
    
    ## **Market Design**
    
    El diseño de mercados (Market Design) es un campo académico de la economía que estudia cómo estructurar reglas e instituciones para que los mercados funcionen de manera eficiente, justa y estable. Se aplica a contextos donde los mecanismos espontáneos de oferta y demanda no bastan, combinando teoría económica, juegos, algoritmos y experimentación.
    
    ### **Datos clave**
    
    - **Fundadores destacados:** Alvin E. Roth, Lloyd S. Shapley, Paul Milgrom.
    - **Ámbitos típicos:** subastas, emparejamientos, mercados de asignación y permisos negociables.
    - **Métodos:** teoría de juegos, análisis empírico estructural y simulaciones computacionales.
    - **Aplicaciones:** asignación de órganos, licitaciones de espectro, admisiones escolares y mercados financieros.
    
    ### **Fundamentos teóricos**
    
    El diseño de mercados surge de la convergencia entre la teoría de mecanismos y la organización industrial. Analiza cómo los incentivos, la información y las reglas determinan el equilibrio y el bienestar. Un principio central es la compatibilidad de incentivos: los mecanismos deben inducir a los participantes a revelar sus verdaderas preferencias o costos.
    
    ### **Subastas y asignación de recursos**
    
    !https://www.researchgate.net/publication/346325002/figure/fig1/AS%3A1083908967927812%401635435444785/Traditional-combinatorial-auction.jpg
    
    !https://wallstreetmojo-files.s3.ap-south-1.amazonaws.com/2021/01/Vickrey-Auction.jpg
    
    !https://images.ctfassets.net/wivd9zt8fi3t/3ppimFdRwuGqQ6oe4sX1Mj/97c834e6012eec704028706dd0a22669/spectrum_allocation.png?q=80&w=1152
    
    **5**
    
    Las subastas representan el enfoque más visible del campo. Diseños como la subasta de reloj combinatoria o las subastas de segundo precio generalizadas permiten asignar recursos escasos —por ejemplo, espectro radioeléctrico— maximizando eficiencia y recaudación. Se analizan aspectos como la estrategia óptima, la colusión y la transparencia.
    
    ### **Mercados de emparejamiento**
    
    El otro pilar del área son los mercados sin precios, donde las asignaciones se hacen por compatibilidad en lugar de dinero. Ejemplos incluyen el **National Resident Matching Program** para médicos residentes o los sistemas de elección escolar. Los algoritmos de **Gale y Shapley** garantizan resultados estables que respetan las preferencias de ambas partes.
    
    ### **Aplicaciones contemporáneas**
    
    Hoy el diseño de mercados se extiende a plataformas digitales, mercados de datos y sistemas algorítmicos de asignación. Centros como el **Zurich Center for Market Design** y el grupo de **National Bureau of Economic Research** integran economía, informática y ciencia de datos para mejorar reglas de mercados financieros, de energía o de inteligencia artificial.
    
    En conjunto, el diseño de mercados ejemplifica la visión del “economista como ingeniero”: usar teoría y evidencia para construir mercados que funcionen mejor para la sociedad.
    

Campo económico sobre **diseñar mercados con incentivos correctos**.

Premio Nobel asociado:

Alvin Roth

TakeasyGO diseña incentivos donde:

- la mejor operación obtiene más visibilidad.

---

# Teoría de sistemas

- Systems Theory
    
    ## **Systems Theory**
    
    La teoría de sistemas es un campo interdisciplinario que estudia los conjuntos de elementos interrelacionados y sus dinámicas colectivas. Propone que todo sistema —biológico, social o técnico— debe entenderse como un todo integrado donde las partes interactúan de manera interdependiente. Su enfoque holístico ha influido en la biología, la ingeniería, la sociología y la gestión organizacional contemporánea .
    
    ### **Hechos clave**
    
    - **Fundador principal:** Ludwig von Bertalanffy (décadas de 1940–1950).
    - **Concepto central:** “El todo es más que la suma de sus partes”.
    - **Tipos de sistemas:** abiertos, cerrados, adaptativos y complejos.
    - **Disciplinas relacionadas:** cibernética, teoría del control, ecología y psicología sistémica.
    
    ### **Origen y desarrollo**
    
    La teoría emergió a mediados del siglo XX como una alternativa al reduccionismo científico. Von Bertalanffy formuló la **Teoría General de Sistemas**, buscando principios comunes aplicables a todos los campos del conocimiento. Su desarrollo coincidió con avances en **cibernética** (Norbert Wiener) y **teoría de la información**, generando un marco común para estudiar organización, retroalimentación y homeostasis en sistemas naturales y artificiales .
    
    ### **Principios fundamentales**
    
    !https://miro.medium.com/1%2AzuN4qdKeHIVenWC8cxcAzA.jpeg
    
    !https://study.com/cimages/multimages/16/682px-system_boundary.svg8964792375022617673.png
    
    !https://ars.els-cdn.com/content/image/3-s2.0-B9780123859150000027-f02-13-9780123859150.jpg
    
    **4**
    
    1. **Interdependencia:** los componentes se afectan mutuamente.
    2. **Retroalimentación:** los sistemas se autorregulan mediante ciclos de información.
    3. **Emergencia:** surgen propiedades nuevas no reducibles a las partes individuales.
    4. **Jerarquía:** los sistemas existen dentro de otros sistemas mayores (holones).
    5. **Equifinalidad:** distintos caminos pueden conducir al mismo resultado global.
    
    ### **Aplicaciones multidisciplinarias**
    
    En biología, la **biología de sistemas** estudia redes moleculares y procesos emergentes; en ingeniería, la **ingeniería de sistemas** integra equipos y procesos complejos; en sociología y psicología, los enfoques sistémicos explican la conducta de grupos y organizaciones. También se aplica en educación y salud para analizar instituciones como sistemas abiertos en constante adaptación .
    
    ### **Influencia y legado**
    
    La teoría de sistemas transformó la comprensión de la complejidad en ciencia y gestión. Inspiró corrientes como la **teoría del caos**, los **sistemas adaptativos complejos** y el pensamiento organizacional de **Peter Senge**, promoviendo la visión integral y el aprendizaje continuo en contextos humanos y tecnológicos. Su legado perdura como paradigma central para abordar problemas interconectados en un mundo cada vez más complejo.
    

Un restaurante es un sistema.

Entradas:

- pedidos

Proceso:

- cocina

Salida:

- pedidos listos

TakeasyGO mide **la estabilidad del sistema**.

---

# Empresas con filosofías similares

Aunque no idénticas, comparten principios.

---

## Stripe

Construyó su producto sobre:

**confiabilidad y simplicidad técnica.**

No marketing agresivo.

---

## Shopify

Construyó herramientas que **empoderan al comerciante**.

No compite con él.

---

## Toast

POS especializado en restaurantes.

Optimiza operación.

- 3️⃣ DOCUMENTO DE DEFENSA DEL FUNDADOR
    
    Este es el documento que te sirve para:
    
    - ventas
    - debates
    - objeciones
    - inversores
    
    ---
    
    # ¿Por qué medir consistencia?
    
    Porque el cliente no percibe solo velocidad.
    
    Percibe **previsibilidad**.
    
    Un restaurante que tarda:
    
    15 minutos siempre
    
    es mejor que uno que tarda:
    
    5 minutos o 40 minutos.
    
    ---
    
    # Por qué no usamos reviews
    
    Las reviews tienen tres problemas:
    
    1️⃣ sesgo emocional
    
    2️⃣ manipulación
    
    3️⃣ baja representatividad
    
    Las plataformas actuales dependen de reviews.
    
    TakeasyGO depende de **datos operativos reales**.
    
    ---
    
    # Por qué el ICO usa 5 variables
    
    Cada variable mide una dimensión distinta.
    
    ---
    
    ### 1 Consistencia
    
    Mide estabilidad de cocina.
    
    ---
    
    ### 2 Cumplimiento
    
    Mide honestidad de promesa.
    
    ---
    
    ### 3 Cancelaciones
    
    Mide confiabilidad.
    
    ---
    
    ### 4 Actividad
    
    Mide continuidad operativa.
    
    ---
    
    ### 5 Estabilidad
    
    Mide disciplina horaria.
    
    ---
    
    # Por qué el mínimo es 30 pedidos
    
    Por el:
    
    Central Limit Theorem
    
    Con menos de 30 datos:
    
    la varianza es demasiado grande.
    
    ---
    
    # Por qué no usamos ranking manipulable
    
    Porque cae en:
    
    Goodhart's Law
    
    ---
    
    # Filosofía final
    
    TakeasyGO no intenta optimizar:
    
    - clicks
    - marketing
    - reviews
    
    Optimiza:
    
    **operación real.**
    
    ---
    
    # Clave
    
    Esto:
    
    Es un **sistema de reputación operativa.**
    
    Mucho más poderoso.
    
    Muy pocas plataformas lo entienden.
    

- El problema que tienen todos los marketplaces
    
    Las apps de comida más grandes como:
    
    - Uber Eats
    - DoorDash
    - Rappi
    
    usan algoritmos de ranking que mezclan:
    
    - publicidad
    - conversión
    - popularidad
    - promociones
    
    Esto genera **dos efectos negativos**.
    
    ### 1️⃣ Pay-to-win
    
    El restaurante con más presupuesto aparece primero.
    
    ### 2️⃣ Rich get richer
    
    El que aparece más arriba vende más.
    
    El que vende más aparece más arriba.
    
    Esto se llama en economía:
    
    **preferential attachment**
    
    Relacionado con el **Efecto Mateo**.
    
    Matthew Effect
    
    > “Al que tiene se le dará más.”
    > 
    
    ---
    
    # 2️⃣Esta rompe ese patrón
    
    TKasyGO se parece más a algo que en economía se llama:
    
    **Mercado basado en reputación operativa.**
    
    Es una forma de **market design**.
    
    Market Design
    
    ---
    
    # 3️⃣ El principio del algoritmo TakeasyGO
    
    El ranking no se basa en:
    
    ❌ popularidad
    
    ❌ publicidad
    
    ❌ rating emocional
    
    Se basa en:
    
    ✔ confiabilidad operativa
    
    ✔ capacidad real de cumplir pedidos
    
    ✔ consistencia en el tiempo
    
    ---
    
    # 4️⃣ Variables del algoritmo
    
    El algoritmo usa **tres capas**.
    
    ---
    
    # CAPA 1
    
    ### Confiabilidad (ICO)
    
    El **ICO** mide si el restaurante opera bien.
    
    Componentes:
    
    - consistencia tiempos
    - cumplimiento promesas
    - cancelaciones
    - actividad
    - estabilidad
    
    Rango:
    
    0 — 100
    
    ---
    
    # CAPA 2
    
    ### Capacidad operativa en tiempo real
    
    Esto evita saturar restaurantes.
    
    Variables posibles:
    
    - órdenes activas
    - capacidad declarada
    - tiempo estimado actual
    
    Ejemplo:
    
    ```
    capacidad_restaurante = max_ordenes_simultaneas
    ordenes_activas = 8
    
    si ordenes_activas > capacidad
        reducir visibilidad
    ```
    
    Esto evita algo muy común en delivery:
    
    restaurantes saturados con **45 minutos de espera**.
    
    ---
    
    # CAPA 3
    
    ### Diversidad de exposición
    
    Esto es lo que casi nadie hace.
    
    Se llama **exploration vs exploitation**.
    
    Multi-armed Bandit
    
    Usado por:
    
    - Netflix
    - Google
    - Amazon
    
    El algoritmo no solo muestra los mejores.
    
    También **explora nuevos restaurantes**.
    
    ---
    
    # 5️⃣ Fórmula conceptual del ranking
    
    Una forma simple sería:
    
    ```
    ranking_score =
        (ICO * 0.6)
      + (capacidad_operativa * 0.25)
      + (exploracion_controlada * 0.15)
    ```
    
    Esto produce:
    
    - restaurantes confiables arriba
    - nuevos restaurantes con oportunidad
    - saturación evitada
    
    ---
    
    # 6️⃣ Resultado para el usuario
    
    Cuando alguien abre TakeasyGO ve:
    
    NO
    
    "los más famosos"
    
    Sino:
    
    **los más confiables ahora mismo.**
    
    ---
    
    # 7️⃣ Resultado para el restaurante
    
    El restaurante aprende que:
    
    la forma de aparecer arriba es:
    
    ✔ cumplir tiempos
    
    ✔ no cancelar
    
    ✔ ser consistente
    
    No gastar dinero en ads.
    
    ---
    
    # 8️⃣ Esto crea un incentivo poderoso
    
    El sistema empuja a los restaurantes a:
    
    **operar mejor.**
    
    No a **optimizar el algoritmo**.
    
    Esto evita caer en:
    
    Goodhart's Law
    
    ---
    
    # 9️⃣ La parte más interesante
    
    Si esto funciona a escala, ocurre algo muy poderoso.
    
    La red empieza a generar:
    
    **reputación operativa pública.**
    
    Los clientes empiezan a decir:
    
    > “Ese restaurante tiene buen ICO.”
    > 
    
    Eso es extremadamente difícil de copiar.
    
    ---
    
    # 🔟 El crecimiento natural de la red
    
    El loop sería:
    
    ```
    mejor operación
    → mejor visibilidad
    → más pedidos
    → más datos
    → mejor reputación
    → más visibilidad
    ```
    
    Eso se llama:
    
    **growth loop.**
    
    No un funnel.
    
    ---
    
    # 11️⃣ Cuando TakeasyGO se vuelve una red
    
    Cuando pase esto:
    
    Un cliente en un restaurante diga:
    
    > "¿No estás en TakeasyGO?"
    > 
    
    Ese es el **network effect inicial**.
    
    ---
    
    # 12️⃣ Importante
    
    El sistema tiene una propiedad rara:
    
    es **anti-gaming**.
    
    Muy pocos algoritmos lo son.
    
    ---
    
    # 13️⃣ Pero lo mas poderosa todavía
    
    Hay un tipo de algoritmo que podría hacer esto **mucho más fuerte**.
    
    Se llama:
    
    **Reputación probabilística.**
    
    Usa algo llamado:
    
    **Bayesian ranking**.
    
    Es lo que usan:
    
    - Reddit
    - Hacker News