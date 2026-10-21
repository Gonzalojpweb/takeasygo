# @takeasygo/inventory-eval — Suite experimental de la Fase V

Instrumento para **falsar** la tesis de TGO Inventory: ¿en qué condiciones TGO toma decisiones tan buenas como una política humana competente (T3) usando sustancialmente menos intervención humana?

Especificación: `INVENTARIO/V-A … V-F` y `END_TO_END_INVENTORY.MD` (correcciones del Lead). Normas: `INVENTARIO/DECISIONES_VIGENTES.md`.

**No se despliega**: no tiene script `build` y ninguna app depende de este paquete.

## Regla central (D-16)

El simulador **no porta** la lógica de producción: importa `@takeasygo/business/inventory`. Lo que se valida es exactamente el código que corre en los restaurantes. El test `apps/saas/__tests__/lib/inventory-eval-foundation.test.ts` lo verifica.

## Estado

| Componente | Estado |
|---|---|
| `shared/rng.ts`: RNG con semilla y `fork()` por componente (CRN) | Listo, con test |
| `shared/provenance.ts`: registro de procedencia congelable | Listo, con test |
| `contracts/observable.ts`: frontera anti-leak (lo único que ven TGO y el baseline) | Listo |
| `contracts/scenario.ts`: salida de V-A | Listo |
| `v-c-tgo/belief-adapter.ts`: creencia de TGO sobre el núcleo de producción | Listo, con test |
| V-A Synthetic Restaurant Generator | **Siguiente** |
| V-B Ground Truth Engine | Pendiente |
| V-D Baselines T1/T2/T3 (se congelan antes de terminar V-C) | Pendiente |
| V-C política de observación y compra | Pendiente (la creencia ya está) |
| V-E Runner (CRN, contrafactual, telemetría) | Pendiente |
| V-F Evaluación estadística | Pendiente |

## Orden obligatorio

V-A → V-B → V-D → V-C → V-E → V-F. Antes de V-A hay que congelar la **función de utilidad** de V-E §23 (costo de faltante, de merma y del minuto humano), registrada en `ProvenanceRegistry`.

## Datos reales

El piloto (`INVENTARIO/PILOTO_RESTAURANTE.md`) produce el Ground Truth real (conteo completo semanal). Esos datos calibran el generador V-A y evitan que el mundo sintético se construya "a imagen de TGO" (V-A §28).
