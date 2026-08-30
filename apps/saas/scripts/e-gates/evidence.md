# E — Gates SaaS en staging (ORDERS_CLOSED / NO_POS_ACTIVE)

Fecha: 2026-08-29T19:15:47.271Z

Resultado: **4/4 checks**

| ID | Check | Resultado |
|----|-------|-----------|
| G2 | posLocationGate:true sin heartbeat POS → 409 NO_POS_ACTIVE | PASS |
| G3 | posLocationGate:true con heartbeat fresco → NO 409 (404 menú = gate superado) | PASS |
| G4 | posLocationGate off sin heartbeat → NO gate (404 menú = legacy intacto) | PASS |
| G1 | acceptsOrders=false → 409 ORDERS_CLOSED (gate real del admin) | PASS |

## Detalle

- **G2** posLocationGate:true sin heartbeat POS → 409 NO_POS_ACTIVE: PASS — `{"status":409,"code":"NO_POS_ACTIVE"}`
- **G3** posLocationGate:true con heartbeat fresco → NO 409 (404 menú = gate superado): PASS — `{"status":404,"body":{"error":"Menú no encontrado para esta sede"}}`
- **G4** posLocationGate off sin heartbeat → NO gate (404 menú = legacy intacto): PASS — `{"status":404,"body":{"error":"Menú no encontrado para esta sede"}}`
- **G1** acceptsOrders=false → 409 ORDERS_CLOSED (gate real del admin): PASS — `{"status":409,"code":"ORDERS_CLOSED"}`