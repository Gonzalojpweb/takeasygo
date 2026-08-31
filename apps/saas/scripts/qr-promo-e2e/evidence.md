# A — QrPromo/Club multi-sede (resolución sede-aware + supresión de captación)

Fecha: 2026-08-31T20:29:15.220Z

Resultado: **34/34 checks**

| ID | Check | Resultado |
|----|-------|-----------|
| A1 | Connection targets __qr_e2e__ (not prod) | PASS |
| A2 | Seed: promo legacy NO tiene campo locationId | PASS |
| A3 | Preflight: tenant existe en __qr_e2e__ | PASS |
| A4 | Preflight: promo sedea-promo existe en __qr_e2e__ | PASS |
| A5 | A1: all-promo (null sede) resolve en sede A | PASS |
| A6 | A1: all-promo (null sede) resolve en sede B | PASS |
| A7 | A2a: sedea-promo resolve en sede A | PASS |
| A8 | A2b: sedea-promo NO resuelve en sede B (cae a all-promo default) | PASS |
| A9 | A2c: default en sede A es la promo mas nueva de ESA sede | PASS |
| A10 | A3a: sede acceptsOrders=false -> show:false location_not_available | PASS |
| A11 | A3b: locationId inexistente -> show:false location_not_available | PASS |
| A12 | A3c: locationId malformado -> show:false location_not_available | PASS |
| A13 | A4a: GET sin locationId mantiene comportamiento legacy (sin scope ni supresion) | PASS |
| A14 | A4b: promo legacy sin campo locationId se comporta como todas las sedes (en sede B) | PASS |
| A15 | A5a: POST view con locationId responde 200 | PASS |
| A16 | A5b: view persiste locationId de la sede A | PASS |
| A17 | A5c: POST view sin locationId responde 200 | PASS |
| A18 | A5d: view sin sede queda con locationId null | PASS |
| A19 | A6a: pedido en sede A creado (201) | PASS |
| A20 | A6b: descuento 20% en sede A (sedea-promo) = 200 | PASS |
| A21 | A6c: pedido en sede B creado (201) | PASS |
| A22 | A6d: en sede B la promo sede A NO aplica; fallback all-promo 10% = 100 | PASS |
| A23 | A6e: sin qrPromoApplied no hay descuento QR | PASS |
| A24 | A7a: login admin ok | PASS |
| A25 | A7b: admin crea promo con locationId (201) | PASS |
| A26 | A7c: promo creada persiste locationId sede A | PASS |
| A27 | A7d: PUT locationId vacio -> todas las sedes (null) | PASS |
| A28 | A7e: PUT con locationId de otro tenant -> 400 | PASS |
| A29 | A7f: POST con locationId de otro tenant -> 400 | PASS |
| A30 | A8a: 1 promo legacy sin campo locationId | PASS |
| A31 | A8b: backfill setea null en la promo legacy | PASS |
| A32 | A8c: 2do run no modifica nada (idempotente) | PASS |
| A33 | A8d: promo legacy ahora tiene locationId null | PASS |
| A34 | A8e: tras backfill sigue resolviendo en todas las sedes (sede A) | PASS |

## Detalle

- **A1** Connection targets __qr_e2e__ (not prod): PASS — `got "__qr_e2e__"`
- **A2** Seed: promo legacy NO tiene campo locationId: PASS — `got=undefined`
- **A3** Preflight: tenant existe en __qr_e2e__: PASS
- **A4** Preflight: promo sedea-promo existe en __qr_e2e__: PASS
- **A5** A1: all-promo (null sede) resolve en sede A: PASS — `{"show":true,"slug":"all-promo"}`
- **A6** A1: all-promo (null sede) resolve en sede B: PASS — `{"show":true,"slug":"all-promo"}`
- **A7** A2a: sedea-promo resolve en sede A: PASS — `{"show":true,"slug":"sedea-promo"}`
- **A8** A2b: sedea-promo NO resuelve en sede B (cae a all-promo default): PASS — `{"show":true,"slug":"all-promo"}`
- **A9** A2c: default en sede A es la promo mas nueva de ESA sede: PASS — `{"show":true,"slug":"sedea-promo"}`
- **A10** A3a: sede acceptsOrders=false -> show:false location_not_available: PASS — `{"show":false,"reason":"location_not_available"}`
- **A11** A3b: locationId inexistente -> show:false location_not_available: PASS — `{"show":false,"reason":"location_not_available"}`
- **A12** A3c: locationId malformado -> show:false location_not_available: PASS — `{"show":false,"reason":"location_not_available"}`
- **A13** A4a: GET sin locationId mantiene comportamiento legacy (sin scope ni supresion): PASS — `{"show":true,"slug":"sedea-promo"}`
- **A14** A4b: promo legacy sin campo locationId se comporta como todas las sedes (en sede B): PASS — `{"show":true,"slug":"legacy-promo"}`
- **A15** A5a: POST view con locationId responde 200: PASS — `status=200`
- **A16** A5b: view persiste locationId de la sede A: PASS — `got=6a95e3db5b222533012a6771`
- **A17** A5c: POST view sin locationId responde 200: PASS — `status=200`
- **A18** A5d: view sin sede queda con locationId null: PASS — `count=1`
- **A19** A6a: pedido en sede A creado (201): PASS — `status=201 body={"order":{"tenantId":"6a95e3db5b222533012a6770","locationId":"6a95e3db5b222533012a6771","orderNumber":"QR--260831-6508","status":"awaiting_payment","orderMode":"takeaway","corporateAccountId":null,"paymentModeSnapshot":null,"whoPays":null,"paymentTiming":null,"groupSessionToken":null,"sessionExpiresAt":null,"items":[{"menuItemId":"6a95e3db5b222533012a6774","promotionId":null,"storeItemId":null,"itemType":"menuItem","categoryName":"Direct Items","name":"Qr Burger","description":"","shortDescription":"","basePrice":1000,"extraPrice":0,"price":1000,"quantity":1,"subtotal":1000,"customizations":[],"selectedVariant":null,"printRole":"kitchen","addedFrom":null,"addedByEmail":null,"promotionTitle":null,"slotName":null,"hasCategoryDiscount":false,"_id":"6a95e3fc5fc707774024b39d"}],"rewardItems":[],"subtotal":1000,"discountAmount":200,"qrPromoApplied":true,"hiddenRewardClaims":[],"promoSlug":"sedea-promo","promoCode":null,"promoCreatedBy":null,"total":809,"customer":{"name":"a608e9c3cc7919f8ef8ae0c98fd7d83a:1414d4a4c07eb096fa0c80462e876f6d:62a8f032a144b17111da8c","phone":"bb0d7b334aaf0b72c27cdfba3927a197:a67aa7c8f6172e1384cc76a11a7f859d:90d84db092998885498f74c8b56f","email":"4a2b8a40a7c95c5d82d660ce429c84a7:990a9963f51aebfd754101436189ac59:c084cb95f4e36fad989922c00ffacf8530cf24a5b63be74a","phoneHash":"172e514a0055da580c6ceff2cae5bf0db2800f0332704f841bdaa13aa338796e"},"payment":{"status":"pending","method":"mercadopago","mercadopagoId":null,"mercadopagoData":null,"kriptonExternalCode":null,"kriptonToken":null,"kriptonData":null,"baseTotal":800,"surchargePercent":1.13,"surchargeAmount":9,"platformFeeAmount":9,"transferConfirmed":false,"transferConfirmedAt":null,"transferConfirmedBy":null,"cashAdjustmentApplied":false,"cashAdjustmentAppliedAt":null,"cashAdjustmentAppliedBy":null},"notes":"","trackingToken":"857fe9b3-e923-47ca-bc4a-c53f70f072a9","trackingTokenUsedAt":null,"clientToken":null,"printed":false,"statusTimestamps":{"confirmedAt":null,"preparingAt":null,"readyAt":null,"enRutaAt":null,"arrivedAt":null,"deliveredAt":null,"cancelledAt":null,"estimatedReadyAt":null,"customerEstimatedReadyAt":null},"posSync":{"status":"not_applicable","posOrderId":null,"attempts":0,"lastAttemptAt":null,"error":null},"orderTiming":"immediate","scheduledPickupAt":null,"scheduledStatus":null,"loyaltyPointsUsed":0,"loyaltyDiscountAmount":0,"rewardAdvanceApplied":false,"rewardAdvanceAmount":0,"loyaltyPointsCredited":false,"rewardDeductionProcessed":false,"source":"qr-calle","deliveryConfirmation":null,"deliveryAddress":null,"deliveryCost":0,"deliveryDistance":0,"deliveryRangeApplied":null,"deletedAt":null,"_id":"6a95e3fc5fc707774024b39c","payments":[],"printLog":[],"createdAt":"2026-08-31T20:28:44.242Z","updatedAt":"2026-08-31T20:28:44.242Z","__v":0}}`
- **A20** A6b: descuento 20% en sede A (sedea-promo) = 200: PASS — `got=200`
- **A21** A6c: pedido en sede B creado (201): PASS — `status=201 body={"order":{"tenantId":"6a95e3db5b222533012a6770","locationId":"6a95e3db5b222533012a6772","orderNumber":"QR--260831-7059","status":"awaiting_payment","orderMode":"takeaway","corporateAccountId":null,"paymentModeSnapshot":null,"whoPays":null,"paymentTiming":null,"groupSessionToken":null,"sessionExpiresAt":null,"items":[{"menuItemId":"6a95e3db5b222533012a6774","promotionId":null,"storeItemId":null,"itemType":"menuItem","categoryName":"Direct Items","name":"Qr Burger","description":"","shortDescription":"","basePrice":1000,"extraPrice":0,"price":1000,"quantity":1,"subtotal":1000,"customizations":[],"selectedVariant":null,"printRole":"kitchen","addedFrom":null,"addedByEmail":null,"promotionTitle":null,"slotName":null,"hasCategoryDiscount":false,"_id":"6a95e3fd5fc707774024b3be"}],"rewardItems":[],"subtotal":1000,"discountAmount":100,"qrPromoApplied":true,"hiddenRewardClaims":[],"promoSlug":"all-promo","promoCode":null,"promoCreatedBy":null,"total":910,"customer":{"name":"dbd9953ab5ab55739f686384441ea69d:67a324b0c6fe4b66960c949cd92a2d4d:4fc6a12f0a3049fbebc2ee","phone":"34650f0a501c62615572c93fcb5163b2:c71c6d956af918b7155922bc1e5e8ebd:a8064e51c17273b9851398dfcc01","email":"60bfce0e69009ed14e8d667f398e96b9:ce0f8227e45dee2f4a4dd9c9a35f1e22:e60e0956a1832c6b5c4ef1139e89321a6e655175856cde5d","phoneHash":"f34a86c698b3c82ad140b7431643844e874e4fa96aa6fff457eca13783c75177"},"payment":{"status":"pending","method":"mercadopago","mercadopagoId":null,"mercadopagoData":null,"kriptonExternalCode":null,"kriptonToken":null,"kriptonData":null,"baseTotal":900,"surchargePercent":1.11,"surchargeAmount":10,"platformFeeAmount":10,"transferConfirmed":false,"transferConfirmedAt":null,"transferConfirmedBy":null,"cashAdjustmentApplied":false,"cashAdjustmentAppliedAt":null,"cashAdjustmentAppliedBy":null},"notes":"","trackingToken":"ced63e47-a702-4243-a9dc-93d2f5928563","trackingTokenUsedAt":null,"clientToken":null,"printed":false,"statusTimestamps":{"confirmedAt":null,"preparingAt":null,"readyAt":null,"enRutaAt":null,"arrivedAt":null,"deliveredAt":null,"cancelledAt":null,"estimatedReadyAt":null,"customerEstimatedReadyAt":null},"posSync":{"status":"not_applicable","posOrderId":null,"attempts":0,"lastAttemptAt":null,"error":null},"orderTiming":"immediate","scheduledPickupAt":null,"scheduledStatus":null,"loyaltyPointsUsed":0,"loyaltyDiscountAmount":0,"rewardAdvanceApplied":false,"rewardAdvanceAmount":0,"loyaltyPointsCredited":false,"rewardDeductionProcessed":false,"source":"qr-calle","deliveryConfirmation":null,"deliveryAddress":null,"deliveryCost":0,"deliveryDistance":0,"deliveryRangeApplied":null,"deletedAt":null,"_id":"6a95e3fd5fc707774024b3bd","payments":[],"printLog":[],"createdAt":"2026-08-31T20:28:45.507Z","updatedAt":"2026-08-31T20:28:45.507Z","__v":0}}`
- **A22** A6d: en sede B la promo sede A NO aplica; fallback all-promo 10% = 100: PASS — `got=100`
- **A23** A6e: sin qrPromoApplied no hay descuento QR: PASS — `status=201 discount=0`
- **A24** A7a: login admin ok: PASS — `cookies=authjs.session-token`
- **A25** A7b: admin crea promo con locationId (201): PASS — `status=201 body={"promo":{"tenantId":"6a95e3db5b222533012a6770","locationId":"6a95e3db5b222533012a6771","scope":"tenant","targetTenants":[],"slug":"admin-promo","isEnabled":true,"scheduledStart":null,"scheduledEnd":null,"type":"discount","discountPercentage":15,"frequency":"once","title":"¡Primera vez por QR!","subtitle":"Obtené {discount}% OFF en tu primer pedido takeaway","buttonText":"Ver menú","termsText":"Válido solo para pedidos takeaway. No acumulable con otras promociones.","imageUrl":"","badgeLabel":"SOLO POR HOY","offLabel":"OFF","takeawayWarningTitle":"DESCUENTO EXCLUSIVO PARA TAKEAWAY","takeawayWarningText":"No aplicable para consumir en el local","loadingText":"Procesando...","checkoutDiscountLabel":"Descuento QR","sourceTriggers":["qr"],"usedCount":0,"maxUsesPerConsumer":1,"createdBy":"admin","_id":"6a95e4115fc707774024b3f0","createdAt":"2026-08-31T20:29:05.714Z","updatedAt":"2026-08-31T20:29:05.714Z","__v":0}}`
- **A26** A7c: promo creada persiste locationId sede A: PASS — `got=6a95e3db5b222533012a6771`
- **A27** A7d: PUT locationId vacio -> todas las sedes (null): PASS — `status=200 got=null`
- **A28** A7e: PUT con locationId de otro tenant -> 400: PASS — `status=400 body={"error":"La sede no existe o no pertenece al tenant"}`
- **A29** A7f: POST con locationId de otro tenant -> 400: PASS — `status=400 body={"error":"La sede no existe o no pertenece al tenant"}`
- **A30** A8a: 1 promo legacy sin campo locationId: PASS — `count=1`
- **A31** A8b: backfill setea null en la promo legacy: PASS — `modified=1`
- **A32** A8c: 2do run no modifica nada (idempotente): PASS — `modified=0`
- **A33** A8d: promo legacy ahora tiene locationId null: PASS — `got=null`
- **A34** A8e: tras backfill sigue resolviendo en todas las sedes (sede A): PASS — `{"show":true,"slug":"legacy-promo"}`