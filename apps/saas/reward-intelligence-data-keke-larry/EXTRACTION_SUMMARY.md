# REWARD INTELLIGENCE DATA EXTRACTION - KEKE&LARRY
**Generated:** 2026-10-03T06:50:54.332Z

==================================================
DATOS DISPONIBLES
==================================================

- **Clientes:** 170
- **Miembros Club:** 116
- **Órdenes:** 253 (238 válidas, 15 canceladas)
- **Order Items:** Extraídos de orders
- **Movimientos de Puntos:** Solo puntos actuales (NO HISTÓRICO)
- **Rewards:** 1
- **Redenciones:** Extraídas de store redemptions y hidden rewards
- **Reward Advance:** Extraído de CustomerEvents y orders
- **Productos:** Analizados desde orders
- **Promociones:** 10 promociones, 2 QR promos
- **Eventos:** 15508 CustomerEvents
- **Eventos PostHog:** 0 (credenciales no disponibles)
- **Período completo:** 2026-06-19 a 2026-10-03 (105 días)

==================================================
DATOS NO DISPONIBLES
==================================================

- **Points Ledger Histórico:** No existe ledger histórico de movimientos de puntos
- **Costos:** No hay datos de food cost, margen, o contribution margin
- **Inventory:** Schema existe pero sin datos para este tenant
- **Tiempos de preparación:** No disponible
- **Capacidad:** No disponible
- **Stockouts:** No disponible
- **Eventos PostHog reales:** Credenciales no disponibles en entorno local

==================================================
DATOS PARCIALES
==================================================

- **Points History:** Solo puntos actuales en loyaltymembers.loyalty.points, sin ledger histórico
- **Reward Advance:** Solo eventos en CustomerEvents, sin confirmación de consolidación
- **Inventory:** Schema existe (inventory_skus, inventory_recipes, inventory_ledger) pero sin datos

==================================================
DATOS CON PROBLEMAS
==================================================

1. **ORDERS** - Orders without customer phoneHash
   - Afectados: 13 (5.1%)
   - Impacto: No se puede vincular a perfil de cliente

2. **ORDERS** - Cancelled orders
   - Afectados: 15 (5.9%)
   - Impacto: No generan revenue ni puntos

==================================================
COBERTURA
==================================================

- **Score:** 90/100
- **Órdenes con phoneHash:** 225/238
- **Eventos con phoneHash:** 0/15508

==================================================
LIMITACIONES
==================================================

1. **Sin ledger de puntos:** No se puede reconstruir el historial completo de movimientos de puntos
2. **Sin datos de costos:** No se puede calcular margen real para rewards
3. **Sin datos operativos:** No se puede evaluar capacidad o restricciones
4. **PostHog inaccesible:** No se puede obtener comportamiento digital completo
5. **Puntos estimados:** Los puntos por orden se estiman como total/1000 (fórmula del código: orderTotalPesos * 0.1)

==================================================
ARCHIVOS GENERADOS
==================================================

1. 01_tenant_coverage.json
2. 02_club_data.json
3. 03_points_rule.json
4. 04_orders_complete.json
5. 05_ticket_real.json
6. 06_recurrence.json
7. 07_points_vs_recurrence.json
8. 08_reward_distance.json
9. 09_reward_advance.json
10. 10_redemptions.json
11. 11_store_items.json
12. 12_products.json
13. 13_product_x_recurrence.json
14. 14_product_x_points.json
15. 15_product_combinations.json
16. 16_customer_x_product.json
17. 17_promotions.json
18. 18_customer_events_complete.json
19. 19_posthog_status.json
20. 20_temporal.json
21. 21_customer_journey.json
22. 22_segmentation.json
23. 23_feedback.json
24. 24_operational.json
25. 25_historical.json
26. 26_data_quality.json
27. 27_data_lineage.json
28. EXTRACTION_SUMMARY.json
28. EXTRACTION_SUMMARY.md
28_reward_intelligence_customer_base.json
28_reward_intelligence_purchase_sequence.json
28_reward_intelligence_threshold_simulation.json

==================================================
DATASETS CLAVES PARA REWARD INTELLIGENCE
==================================================

**28_reward_intelligence_customer_base.json**
- Una fila por cliente
- Incluye: club_member, orders_count, total_spent, avg_ticket, first/last order, points_current, points_earned, points_per_order, segment, health_score

**28_reward_intelligence_purchase_sequence.json**
- Una fila por compra por cliente
- Incluye: purchase_number, days_since_previous, order_total, points_earned, products, categories, promotion, reward_used, reward_advance

**28_reward_intelligence_threshold_simulation.json**
- Una fila por cliente × threshold
- Incluye: current_points, points_remaining, percentage_completed, estimated_orders_remaining, days_to_threshold, reached_historically
- Thresholds: 3k, 5k, 8k, 10k, 11k, 12k, 15k, 20k, 25k, 30k, 40k, 50k

==================================================
REGLA DE PUNTOS (CÓDIGO)
==================================================

**Fuente:** apps/saas/lib/loyalty.ts

**Modo:** fixed_per_currency (default)

**Fórmula:**
``
orderTotalPesos = orderTotal / 100  (centavos → pesos)
rawBase = orderTotalPesos × pointsPerCurrency  (default: 0.1)
basePoints = Math.floor(rawBase)
fractionalRemainder = rawBase - basePoints
microBonusRaw = fractionalRemainder × 0.0575
microBonus = Math.max(1, Math.round(microBonusRaw × 100)) > 50 ? Math.ceil(fractionalRemainder) : Math.floor(fractionalRemainder)
microBonusFinal = microBonus > 0 ? microBonus : (fractionalRemainder ≥ 0.5 ? 1 : 0)
total = basePoints + microBonusFinal + pointsPerOrder
``

**Resultado:** ~1 punto por $10 (default)

==================================================
END OF EXTRACTION SUMMARY
==================================================
