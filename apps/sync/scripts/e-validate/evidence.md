# E — Validación sync-layer (staging, Redis degradado)

Fecha: 2026-08-29T14:21:58.335Z

Resultado: **10/10 checks**

| ID | Check | Resultado |
|----|-------|-----------|
| C1 | login pin con locationId válida → 200 + JWT con claim locationId | PASS |
| C2 | login con sede inactiva → 400 INVALID_LOCATION | PASS |
| C3 | login con locationId malformada → 400 INVALID_LOCATION | PASS |
| C4 | login legacy sin locationId → 200, JWT sin claim locationId | PASS |
| C5 | GET /locations → solo 2 sedes activas | PASS |
| C6 | GET /orders/pending filtrado por sede → solo la de sede A | PASS |
| C7 | GET /orders/pending legacy → ambas sedes | PASS |
| C8 | internal GET /orders?locationId=B → solo sede B con locationId persistido | PASS |
| C9 | internal GET /orders sin filtro → ambas sedes | PASS |
| C10 | índice compuesto tenantId+locationId+createdAt en sync_orders | PASS |

## Detalle

- **C1** login pin con locationId válida → 200 + JWT con claim locationId: PASS — `{"status":200,"payload":{"sub":"6a92eafdc033dd2152251f18","tenantId":"6a92eafcc033dd2152251eff","role":"admin","deviceType":"hub","locationId":"6a92eafcc033dd2152251f00","iat":1788013310,"exp":1788015110}}`
- **C2** login con sede inactiva → 400 INVALID_LOCATION: PASS — `{"status":400,"body":{"error":"Location not found for this tenant","code":"INVALID_LOCATION"}}`
- **C3** login con locationId malformada → 400 INVALID_LOCATION: PASS — `{"status":400,"body":{"error":"Invalid locationId","code":"INVALID_LOCATION"}}`
- **C4** login legacy sin locationId → 200, JWT sin claim locationId: PASS — `{"status":200}`
- **C5** GET /locations → solo 2 sedes activas: PASS — `[{"id":"6a92eafcc033dd2152251f00","name":"E Sede A","slug":"e-sede-a","address":"A","acceptsOrders":true},{"id":"6a92eafcc033dd2152251f01","name":"E Sede B","slug":"e-sede-b","address":"B","acceptsOrders":true}]`
- **C6** GET /orders/pending filtrado por sede → solo la de sede A: PASS — `["6a92eafdc033dd2152251f1f"]`
- **C7** GET /orders/pending legacy → ambas sedes: PASS — `["6a92eafdc033dd2152251f22","6a92eafdc033dd2152251f1f"]`
- **C8** internal GET /orders?locationId=B → solo sede B con locationId persistido: PASS — `[{"orderId":"6a92eafdc033dd2152251f22","tenantId":"6a92eafcc033dd2152251eff","locationId":"6a92eafcc033dd2152251f01","source":"takeasygo","status":"pending","paymentMethod":"cash","items":[{"name":"Item B","quantity":1,"unitPrice":200,"total":200,"_id":"6a92eafdc033dd2152251f23","modifiers":[]}],"total":200,"createdAt":"2026-08-29T14:21:49.807Z"}]`
- **C9** internal GET /orders sin filtro → ambas sedes: PASS — `["6a92eafdc033dd2152251f22","6a92eafdc033dd2152251f1f"]`
- **C10** índice compuesto tenantId+locationId+createdAt en sync_orders: PASS — `[{"name":"_id_","key":{"_id":1}},{"name":"tenantId_1","key":{"tenantId":1}},{"name":"tenantId_1_createdAt_-1","key":{"tenantId":1,"createdAt":-1}},{"name":"tenantId_1_status_1","key":{"tenantId":1,"status":1}},{"name":"tenantId_1_externalOrderId_1","key":{"tenantId":1,"externalOrderId":1}},{"name":"tenantId_1_locationId_1_createdAt_-1","key":{"tenantId":1,"locationId":1,"createdAt":-1}}]`