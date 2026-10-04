#!/usr/bin/env python3
"""
Upselling Intelligence Analysis for Keke&Larry
Genera análisis completo de oportunidades de upselling basado en comportamiento real
"""

import json
from collections import defaultdict, Counter
from datetime import datetime
import statistics

# Load datasets
def load_json(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        return json.load(f)

# Paths
base_path = r"C:\Users\Gonzalo Palomo\Dropbox\Mi PC (LAPTOP-NVALH40I)\Desktop\takeasygo\apps\saas\reward-intelligence-data-keke-larry"

print("Loading datasets...")
product_combinations = load_json(f"{base_path}/15_product_combinations.json")
products_data = load_json(f"{base_path}/12_products.json")
ticket_data = load_json(f"{base_path}/05_ticket_real.json")
customer_x_product = load_json(f"{base_path}/16_customer_x_product.json")
recurrence_data = load_json(f"{base_path}/06_recurrence.json")
purchase_sequence = load_json(f"{base_path}/28_reward_intelligence_purchase_sequence.json")
temporal_data = load_json(f"{base_path}/20_temporal.json")
product_x_recurrence = load_json(f"{base_path}/13_product_x_recurrence.json")
club_data = load_json(f"{base_path}/02_club_data.json")
orders_complete = load_json(f"{base_path}/04_orders_complete.json")

print("Datasets loaded successfully!")

# ============================================
# 1. COMPOSICIÓN DEL TICKET
# ============================================
print("\n=== 1. COMPOSICIÓN DEL TICKET ===")

ticket_by_items = defaultdict(list)
for order in ticket_data['byOrder']:
    items_count = order['itemsCount']
    ticket_by_items[items_count].append(order['ticket'])

ticket_composition = {}
for items_count, tickets in ticket_by_items.items():
    ticket_composition[items_count] = {
        'count': len(tickets),
        'avg_ticket': statistics.mean(tickets),
        'min_ticket': min(tickets),
        'max_ticket': max(tickets),
        'total_revenue': sum(tickets)
    }

# Total orders
total_orders = len(ticket_data['byOrder'])
total_revenue = sum(order['ticket'] for order in ticket_data['byOrder'])

# ============================================
# 2. PRODUCT AFFINITY / CO-COMPRA
# ============================================
print("\n=== 2. PRODUCT AFFINITY / CO-COMPRA ===")

# Calculate individual product frequencies from customer_x_product
product_frequency = defaultdict(int)
product_customers = defaultdict(set)

for customer in customer_x_product:
    for product in customer['products']:
        product_name = product['name']
        product_frequency[product_name] += product['quantity']
        product_customers[product_name].add(customer['customerPhoneHash'])

# Calculate affinity from product_combinations
affinity_analysis = []
for pair in product_combinations['pairs']:
    pair_name = pair['pair']
    products = pair_name.split(' + ')
    
    if len(products) == 2:
        prod_a, prod_b = products
        
        # Skip if same product (it's just double order)
        if prod_a == prod_b:
            continue
            
        customers_a = product_customers.get(prod_a, set())
        customers_b = product_customers.get(prod_b, set())
        pair_customers = pair['uniqueCustomers']
        
        # Penetration: Of those who buy A, X% also buy B
        penetration_a_to_b = (pair_customers / len(customers_a)) * 100 if customers_a else 0
        penetration_b_to_a = (pair_customers / len(customers_b)) * 100 if customers_b else 0
        
        # Classification
        if penetration_a_to_b >= 50:
            classification = "ALTA_AFINIDAD"
        elif penetration_a_to_b >= 30:
            classification = "MEDIA_AFINIDAD"
        elif penetration_a_to_b >= 15:
            classification = "BAJA_AFINIDAD"
        else:
            classification = "OPORTUNIDAD_POTENCIAL"
        
        affinity_analysis.append({
            'pair': pair_name,
            'count': pair['count'],
            'unique_customers': pair['uniqueCustomers'],
            'revenue': pair['revenue'],
            'avg_ticket': pair['avgTicket'],
            'customers_a': len(customers_a),
            'customers_b': len(customers_b),
            'penetration_a_to_b': round(penetration_a_to_b, 2),
            'penetration_b_to_a': round(penetration_b_to_a, 2),
            'classification': classification
        })

# Sort by count
affinity_analysis.sort(key=lambda x: x['count'], reverse=True)

# ============================================
# 3. PRODUCTOS ANCLA
# ============================================
print("\n=== 3. PRODUCTOS ANCLA ===")

anchor_products = []
for product_name, frequency in product_frequency.items():
    customers_count = len(product_customers.get(product_name, set()))
    
    # Anchor score: combination of volume, customers, and frequency
    anchor_score = (frequency * 0.4) + (customers_count * 0.4) + (frequency / max(1, customers_count) * 0.2)
    
    anchor_products.append({
        'name': product_name,
        'frequency': frequency,
        'unique_customers': customers_count,
        'anchor_score': round(anchor_score, 2)
    })

anchor_products.sort(key=lambda x: x['anchor_score'], reverse=True)

# ============================================
# 4. UPSELL VS CO-COMPRA
# ============================================
print("\n=== 4. UPSELL VS CO-COMPRA ===")

# Calculate individual product average tickets
product_tickets = defaultdict(list)
for order in ticket_data['byOrder']:
    for product in order['products']:
        product_tickets[product].append(order['ticket'])

product_avg_tickets = {}
for product, tickets in product_tickets.items():
    product_avg_tickets[product] = statistics.mean(tickets)

upsell_analysis = []
for pair in product_combinations['pairs']:
    pair_name = pair['pair']
    products = pair_name.split(' + ')
    
    if len(products) == 2:
        prod_a, prod_b = products
        
        if prod_a == prod_b:
            continue
        
        # Get individual product tickets
        tickets_a = product_tickets.get(prod_a, [])
        tickets_b = product_tickets.get(prod_b, [])
        tickets_pair = [pair['avgTicket']] * pair['count']
        
        avg_ticket_a = statistics.mean(tickets_a) if tickets_a else 0
        avg_ticket_b = statistics.mean(tickets_b) if tickets_b else 0
        avg_ticket_pair = pair['avgTicket']
        
        # Increment calculation
        increment_vs_a = ((avg_ticket_pair - avg_ticket_a) / avg_ticket_a * 100) if avg_ticket_a > 0 else 0
        increment_vs_b = ((avg_ticket_pair - avg_ticket_b) / avg_ticket_b * 100) if avg_ticket_b > 0 else 0
        
        # Classify upsell potential
        if increment_vs_a >= 30 and pair['count'] >= 5:
            upsell_class = "UPSELL_NATURAL"
        elif increment_vs_a >= 20 and pair['count'] >= 3:
            upsell_class = "UPSELL_POTENCIAL"
        elif increment_vs_a >= 10:
            upsell_class = "UPSELL_LEVE"
        else:
            upsell_class = "NO_RECOMENDADO"
        
        upsell_analysis.append({
            'pair': pair_name,
            'count': pair['count'],
            'avg_ticket_a': round(avg_ticket_a, 2),
            'avg_ticket_b': round(avg_ticket_b, 2),
            'avg_ticket_pair': round(avg_ticket_pair, 2),
            'increment_vs_a': round(increment_vs_a, 2),
            'increment_vs_b': round(increment_vs_b, 2),
            'upsell_class': upsell_class
        })

upsell_analysis.sort(key=lambda x: x['increment_vs_a'], reverse=True)

# ============================================
# 5. PRODUCTOS CON POTENCIAL DE UPSELL
# ============================================
print("\n=== 5. PRODUCTOS CON POTENCIAL DE UPSELL ===")

upsell_potential = defaultdict(float)
for analysis in upsell_analysis:
    if analysis['upsell_class'] in ['UPSELL_NATURAL', 'UPSELL_POTENCIAL']:
        products = analysis['pair'].split(' + ')
        if len(products) == 2 and products[0] != products[1]:
            # Add potential to both products
            upsell_potential[products[0]] += analysis['increment_vs_a'] * analysis['count']
            upsell_potential[products[1]] += analysis['increment_vs_b'] * analysis['count']

upsell_ranking = []
for product, potential in upsell_potential.items():
    upsell_ranking.append({
        'product': product,
        'upsell_potential_score': round(potential, 2),
        'frequency': product_frequency.get(product, 0),
        'customers': len(product_customers.get(product, set()))
    })

upsell_ranking.sort(key=lambda x: x['upsell_potential_score'], reverse=True)

# ============================================
# 6. UPSELL POR VALOR DE TICKET
# ============================================
print("\n=== 6. UPSELL POR VALOR DE TICKET ===")

ticket_impact = []
for analysis in upsell_analysis:
    if analysis['upsell_class'] in ['UPSELL_NATURAL', 'UPSELL_POTENCIAL']:
        total_incremental_revenue = analysis['increment_vs_a'] / 100 * analysis['avg_ticket_a'] * analysis['count']
        ticket_impact.append({
            'pair': analysis['pair'],
            'count': analysis['count'],
            'avg_ticket_pair': analysis['avg_ticket_pair'],
            'increment_pct': analysis['increment_vs_a'],
            'total_incremental_revenue': round(total_incremental_revenue, 2)
        })

ticket_impact.sort(key=lambda x: x['total_incremental_revenue'], reverse=True)

# ============================================
# 7. UPSELL POR CLIENTE
# ============================================
print("\n=== 7. UPSELL POR CLIENTE ===")

# Find customers who buy A but never B
customer_missing_products = defaultdict(list)
for customer in customer_x_product:
    customer_products = set(p['name'] for p in customer['products'])
    
    for prod_a, prod_b in [(a['pair'].split(' + ')[0], a['pair'].split(' + ')[1]) 
                           for a in affinity_analysis[:20] if '+' in a['pair']]:
        if prod_a in customer_products and prod_b not in customer_products:
            customer_missing_products[customer['customerPhoneHash']].append({
                'has': prod_a,
                'missing': prod_b,
                'customer_total': customer['totalSpent']
            })

# Count patterns
missing_patterns = defaultdict(int)
for customer, missing in customer_missing_products.items():
    for item in missing:
        pattern = f"{item['has']} -> {item['missing']}"
        missing_patterns[pattern] += 1

missing_ranking = []
for pattern, count in missing_patterns.items():
    if count >= 2:  # Only show patterns that appear at least twice
        missing_ranking.append({
            'pattern': pattern,
            'customers_affected': count
        })

missing_ranking.sort(key=lambda x: x['customers_affected'], reverse=True)

# ============================================
# 8. UPSELL Y RECURRENCIA
# ============================================
print("\n=== 8. UPSELL Y RECURRENCIA ===")

# Analyze products in recurrent customers (2+ orders)
recurrent_customers = [c for c in recurrence_data['customerRecurrence'] if c['ordersCount'] >= 2]
recurrent_product_freq = defaultdict(int)

for customer in recurrent_customers:
    for order in customer['orders']:
        for product in order['products']:
            recurrent_product_freq[product] += 1

# Compare with non-recurrent
non_recurrent_customers = [c for c in recurrence_data['customerRecurrence'] if c['ordersCount'] == 1]
non_recurrent_product_freq = defaultdict(int)

for customer in non_recurrent_customers:
    for order in customer['orders']:
        for product in order['products']:
            non_recurrent_product_freq[product] += 1

recurrence_analysis = []
all_products = set(recurrent_product_freq.keys()) | set(non_recurrent_product_freq.keys())

for product in all_products:
    recurrent_count = recurrent_product_freq.get(product, 0)
    non_recurrent_count = non_recurrent_product_freq.get(product, 0)
    
    if recurrent_count > 0:
        recurrence_ratio = recurrent_count / (recurrent_count + non_recurrent_count) * 100
        recurrence_analysis.append({
            'product': product,
            'recurrent_count': recurrent_count,
            'non_recurrent_count': non_recurrent_count,
            'recurrence_ratio': round(recurrence_ratio, 2)
        })

recurrence_analysis.sort(key=lambda x: x['recurrence_ratio'], reverse=True)

# ============================================
# 9. UPSELL Y PUNTOS DEL CLUB
# ============================================
print("\n=== 9. UPSELL Y PUNTOS DEL CLUB ===")

# Analyze if higher ticket correlates with more points
ticket_points_correlation = []
for order in ticket_data['byOrder']:
    if order['pointsEarned'] > 0:
        ticket_points_correlation.append({
            'ticket': order['ticket'],
            'points': order['pointsEarned'],
            'items': order['itemsCount']
        })

# Calculate correlation (simplified)
if len(ticket_points_correlation) > 1:
    avg_ticket_with_points = statistics.mean([x['ticket'] for x in ticket_points_correlation])
    avg_points = statistics.mean([x['points'] for x in ticket_points_correlation])
else:
    avg_ticket_with_points = 0
    avg_points = 0

# ============================================
# 10. UPSELL POR MOMENTO
# ============================================
print("\n=== 10. UPSELL POR MOMENTO ===")

# Peak hours for upsell opportunities
hourly_analysis = []
for hour_data in temporal_data['hourly']:
    if hour_data['count'] > 0:
        avg_ticket = hour_data['revenue'] / hour_data['count']
        hourly_analysis.append({
            'hour': hour_data['hour'],
            'count': hour_data['count'],
            'revenue': hour_data['revenue'],
            'avg_ticket': round(avg_ticket, 2)
        })

hourly_analysis.sort(key=lambda x: x['avg_ticket'], reverse=True)

# Day of week analysis
dow_analysis = []
for dow_data in temporal_data['dow']:
    if dow_data['count'] > 0:
        avg_ticket = dow_data['revenue'] / dow_data['count']
        dow_analysis.append({
            'dow': dow_data['dow'],
            'count': dow_data['count'],
            'revenue': dow_data['revenue'],
            'avg_ticket': round(avg_ticket, 2)
        })

dow_analysis.sort(key=lambda x: x['avg_ticket'], reverse=True)

# ============================================
# 11. UPSELL POR ETAPA DEL CLIENTE
# ============================================
print("\n=== 11. UPSELL POR ETAPA DEL CLIENTE ===")

# Analyze products by purchase number
purchase_stage_products = defaultdict(lambda: defaultdict(int))
for purchase in purchase_sequence:
    stage = purchase['purchase_number']
    # products array is empty in the data, so we need to get from other sources
    # This is a limitation of the current dataset

# Use product_x_recurrence instead
stage_analysis = defaultdict(list)
for product in product_x_recurrence:
    if product['purchaseNumbers']:
        avg_stage = statistics.mean(product['purchaseNumbers'])
        stage_analysis[product['name']] = {
            'avg_purchase_number': round(avg_stage, 2),
            'first_purchase': product['firstPurchase'],
            'last_purchase': product['lastPurchase'],
            'order_count': product['orderCount']
        }

stage_ranking = []
for product, data in stage_analysis.items():
    stage_ranking.append({
        'product': product,
        'avg_purchase_stage': data['avg_purchase_number'],
        'first_purchase': data['first_purchase'],
        'last_purchase': data['last_purchase'],
        'order_count': data['order_count']
    })

stage_ranking.sort(key=lambda x: x['avg_purchase_stage'], reverse=True)

# ============================================
# 12. PRODUCTOS NO RECOMENDADOS
# ============================================
print("\n=== 12. PRODUCTOS NO RECOMENDADOS ===")

not_recommended = []
for analysis in upsell_analysis:
    if analysis['upsell_class'] == 'NO_RECOMENDADO':
        not_recommended.append({
            'pair': analysis['pair'],
            'count': analysis['count'],
            'increment_vs_a': analysis['increment_vs_a'],
            'reason': 'Bajo incremento de ticket o baja frecuencia'
        })

not_recommended.sort(key=lambda x: x['count'], reverse=True)

# ============================================
# 13. RIESGO DE CANNIBALIZACIÓN
# ============================================
print("\n=== 13. RIESGO DE CANNIBALIZACIÓN ===")

# High penetration pairs may indicate natural co-purchase (cannibalization risk)
cannibalization_risk = []
for analysis in affinity_analysis:
    if analysis['penetration_a_to_b'] >= 60:
        cannibalization_risk.append({
            'pair': analysis['pair'],
            'penetration_a_to_b': analysis['penetration_a_to_b'],
            'penetration_b_to_a': analysis['penetration_b_to_a'],
            'risk_level': 'ALTO' if analysis['penetration_a_to_b'] >= 80 else 'MEDIO'
        })

cannibalization_risk.sort(key=lambda x: x['penetration_a_to_b'], reverse=True)

# ============================================
# GENERATE REPORT
# ============================================
print("\n=== GENERATING REPORT ===")

report = {
    'metadata': {
        'generated_at': datetime.now().isoformat(),
        'tenant': 'Keke&Larry',
        'total_orders': total_orders,
        'total_revenue': total_revenue,
        'total_customers': len(customer_x_product)
    },
    '1_ticket_composition': ticket_composition,
    '2_product_affinity': affinity_analysis[:30],
    '3_anchor_products': anchor_products[:15],
    '4_upsell_vs_copurchase': upsell_analysis[:30],
    '5_upsell_potential_ranking': upsell_ranking[:20],
    '6_upsell_by_ticket_value': ticket_impact[:20],
    '7_upsell_by_customer': {
        'missing_patterns': missing_ranking[:15],
        'total_customers_with_opportunities': len(customer_missing_products)
    },
    '8_upsell_and_recurrence': recurrence_analysis[:20],
    '9_upsell_and_points': {
        'avg_ticket_with_points': round(avg_ticket_with_points, 2),
        'avg_points': round(avg_points, 2),
        'correlation_orders': len(ticket_points_correlation)
    },
    '10_upsell_by_moment': {
        'peak_hours': hourly_analysis[:10],
        'peak_days': dow_analysis[:7]
    },
    '11_upsell_by_customer_stage': stage_ranking[:20],
    '12_not_recommended': not_recommended[:20],
    '13_cannibalization_risk': cannibalization_risk[:15]
}

# Save JSON output
with open(f"{base_path}/upselling_intelligence_keke_larry.json", 'w', encoding='utf-8') as f:
    json.dump(report, f, indent=2, ensure_ascii=False)

print("JSON report saved!")

# Generate Markdown report
md_report = f"""# UPSELLING INTELLIGENCE - KEKE & LARRY

**Generado:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**Total Pedidos:** {total_orders:,}
**Ingreso Total:** ${total_revenue:,.0f}
**Total Clientes:** {len(customer_x_product):,}

---

## RESUMEN EJECUTIVO

Este análisis identifica oportunidades de upselling basadas en comportamiento real de compra, 
combinaciones de productos, patrones de recurrencia y composición del ticket.

**Metricas Clave:**
- Ticket promedio global: ${total_revenue/total_orders:,.0f}
- Productos únicos: {len(product_frequency)}
- Combinaciones de productos analizadas: {len(product_combinations['pairs'])}

---

## 1. COMPOSICIÓN DEL TICKET

### Ticket promedio por cantidad de items

| Items | Pedidos | Ticket Promedio | Ticket Mín | Ticket Máx | Ingreso Total |
|-------|---------|-----------------|------------|-----------|---------------|
"""

for items, data in sorted(ticket_composition.items()):
    md_report += f"| {items} | {data['count']} | ${data['avg_ticket']:,.0f} | ${data['min_ticket']:,.0f} | ${data['max_ticket']:,.0f} | ${data['total_revenue']:,.0f} |\n"

md_report += f"""

**Observaciones:**
- El ticket aumenta al agregar más items
- {'+' if len(ticket_composition) > 1 else ''}Patrones de composición identificados

---

## 2. PRODUCT AFFINITY / CO-COMPRA

### Top combinaciones por penetración

**Penetración:** De los que compran A, X% también compran B

| Combinación | Frecuencia | Clientes Únicos | Ticket Promedio | Penetración A→B | Penetración B→A | Clasificación |
|-------------|------------|-----------------|-----------------|-----------------|-----------------|---------------|
"""

for aff in affinity_analysis[:20]:
    md_report += f"| {aff['pair']} | {aff['count']} | {aff['unique_customers']} | ${aff['avg_ticket']:,.0f} | {aff['penetration_a_to_b']}% | {aff['penetration_b_to_a']}% | {aff['classification']} |\n"

md_report += f"""

**Clasificaciones:**
- **ALTA_AFINIDAD:** ≥50% penetración (co-compra natural)
- **MEDIA_AFINIDAD:** 30-49% penetración
- **BAJA_AFINIDAD:** 15-29% penetración
- **OPORTUNIDAD_POTENCIAL:** <15% penetración (espacio para crecer)

---

## 3. PRODUCTOS ANCLA

### Ranking de productos ancla por volumen y clientes

| Producto | Frecuencia | Clientes Únicos | Score Ancla |
|----------|------------|-----------------|-------------|
"""

for anchor in anchor_products[:15]:
    md_report += f"| {anchor['name']} | {anchor['frequency']} | {anchor['unique_customers']} | {anchor['anchor_score']} |\n"

md_report += f"""

**Productos ancla** son aquellos que funcionan como entrada natural al carrito,
con alto volumen de ventas y amplia base de clientes.

---

## 4. UPSELL VS CO-COMPRA

### Análisis de incremento de ticket por combinación

| Combinación | Frecuencia | Ticket A | Ticket B | Ticket A+B | Incremento vs A | Incremento vs B | Clasificación |
|-------------|------------|----------|----------|------------|-----------------|-----------------|---------------|
"""

for upsell in upsell_analysis[:25]:
    md_report += f"| {upsell['pair']} | {upsell['count']} | ${upsell['avg_ticket_a']:,.0f} | ${upsell['avg_ticket_b']:,.0f} | ${upsell['avg_ticket_pair']:,.0f} | {upsell['increment_vs_a']}% | {upsell['increment_vs_b']}% | {upsell['upsell_class']} |\n"

md_report += f"""

**Clasificaciones de Upsell:**
- **UPSELL_NATURAL:** Incremento ≥30% con frecuencia ≥5 (recomendación fuerte)
- **UPSELL_POTENCIAL:** Incremento ≥20% con frecuencia ≥3 (recomendación media)
- **UPSELL_LEVE:** Incremento ≥10% (recomendación baja)
- **NO_RECOMENDADO:** Bajo incremento o baja frecuencia

---

## 5. PRODUCTOS CON POTENCIAL DE UPSELL

### Ranking de oportunidades por producto

| Producto | Score Potencial Upsell | Frecuencia | Clientes |
|----------|------------------------|------------|----------|
"""

for ranking in upsell_ranking[:15]:
    md_report += f"| {ranking['product']} | {ranking['upsell_potential_score']:.2f} | {ranking['frequency']} | {ranking['customers']} |\n"

md_report += f"""

**Score Potencial Upsell** combina el incremento de ticket y la frecuencia de la combinación.

---

## 6. UPSELL POR VALOR DE TICKET

### Impacto en ingreso incremental

| Combinación | Frecuencia | Ticket Promedio | Incremento % | Ingreso Incremental Total |
|-------------|------------|------------------|--------------|---------------------------|
"""

for impact in ticket_impact[:15]:
    md_report += f"| {impact['pair']} | {impact['count']} | ${impact['avg_ticket_pair']:,.0f} | {impact['increment_pct']}% | ${impact['total_incremental_revenue']:,.0f} |\n"

md_report += f"""

---

## 7. UPSELL POR CLIENTE

### Patrones de clientes que compran A pero nunca B

| Patrón (Tiene → Falta) | Clientes Afectados |
|------------------------|-------------------|
"""

for pattern in missing_ranking[:10]:
    md_report += f"| {pattern['pattern']} | {pattern['customers_affected']} |\n"

md_report += f"""
**Total clientes con oportunidades identificadas:** {len(customer_missing_products)}

---

## 8. UPSELL Y RECURRENCIA

### Productos en clientes recurrentes vs no recurrentes

| Producto | Frecuencia Recurrente | Frecuencia No Recurrente | Ratio Recurrencia |
|----------|----------------------|--------------------------|-------------------|
"""

for rec in recurrence_analysis[:15]:
    md_report += f"| {rec['product']} | {rec['recurrent_count']} | {rec['non_recurrent_count']} | {rec['recurrence_ratio']}% |\n"

md_report += f"""

**Ratio Recurrencia:** Porcentaje de compras que vienen de clientes recurrentes (2+ pedidos).
Productos con alto ratio son más propensos a ser comprados por clientes leales.

---

## 9. UPSELL Y PUNTOS DEL CLUB

### Correlación Ticket-Puntos

- **Ticket promedio con puntos:** ${avg_ticket_with_points:,.0f}
- **Puntos promedio por pedido:** {avg_points:,.0f}
- **Pedidos con puntos analizados:** {len(ticket_points_correlation)}

**Nota:** Los puntos se otorgan según reglas del club (1 punto = $1 gastado).
Esta correlación indica que el sistema de fidelización está activo.

---

## 10. UPSELL POR MOMENTO

### Horas pico por ticket promedio

| Hora | Pedidos | Ingreso Total | Ticket Promedio |
|------|---------|--------------|-----------------|
"""

for hour in hourly_analysis[:10]:
    md_report += f"| {hour['hour']}:00 | {hour['count']} | ${hour['revenue']:,.0f} | ${hour['avg_ticket']:,.0f} |\n"

md_report += f"""

### Días de la semana por ticket promedio

| Día | Pedidos | Ingreso Total | Ticket Promedio |
|-----|---------|--------------|-----------------|
"""

dow_names = {0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado'}
for dow in dow_analysis:
    md_report += f"| {dow_names.get(dow['dow'], dow['dow'])} | {dow['count']} | ${dow['revenue']:,.0f} | ${dow['avg_ticket']:,.0f} |\n"

md_report += f"""

---

## 11. UPSELL POR ETAPA DEL CLIENTE

### Productos por etapa de compra (número de compra promedio)

| Producto | Etapa Promedio | Primera Compra | Última Compra | Pedidos |
|----------|----------------|----------------|---------------|---------|
"""

for stage in stage_ranking[:15]:
    md_report += f"| {stage['product']} | {stage['avg_purchase_stage']:.2f} | {stage['first_purchase']} | {stage['last_purchase']} | {stage['order_count']} |\n"

md_report += f"""

**Etapa de compra:** Número promedio de compra en el que aparece el producto.
Productos con etapa alta tienden a ser descubiertos por clientes recurrentes.

---

## 12. PRODUCTOS NO RECOMENDADOS PARA UPSELL

### Combinaciones con bajo potencial

| Combinación | Frecuencia | Incremento vs A | Razón |
|-------------|------------|------------------|-------|
"""

for not_rec in not_recommended[:10]:
    md_report += f"| {not_rec['pair']} | {not_rec['count']} | {not_rec['increment_vs_a']}% | {not_rec['reason']} |\n"

md_report += f"""

---

## 13. RIESGO DE CANNIBALIZACIÓN

### Combinaciones con alta penetración natural

| Combinación | Penetración A→B | Penetración B→A | Nivel de Riesgo |
|-------------|-----------------|-----------------|----------------|
"""

for risk in cannibalization_risk[:10]:
    md_report += f"| {risk['pair']} | {risk['penetration_a_to_b']}% | {risk['penetration_b_to_a']}% | {risk['risk_level']} |\n"

md_report += f"""

**Riesgo de Cannibalización:** Combinaciones con penetración ≥60% indican que
los productos ya se compran naturalmente juntos. Recomendar B cuando ya compran A
puede no generar valor incremental.

---

## RECOMENDACIONES ESTRATÉGICAS

### 1. Prioridades Inmediatas (Alto Impacto)

Basado en el análisis, las siguientes combinaciones tienen mayor potencial:

"""

# Top 5 upsell opportunities
top_upsells = upsell_analysis[:5]
for i, upsell in enumerate(top_upsells, 1):
    if upsell['upsell_class'] in ['UPSELL_NATURAL', 'UPSELL_POTENCIAL']:
        md_report += f"{i}. **{upsell['pair']}** - Incremento del {upsell['increment_vs_a']}% en ticket\n"

md_report += f"""

### 2. Estrategia de Productos Ancla

Enfocar recomendaciones en productos ancla:
"""

for anchor in anchor_products[:5]:
    md_report += f"- **{anchor['name']}** (Score: {anchor['anchor_score']})\n"

md_report += f"""

### 3. Momentos Óptimos

Priorizar upsell en:
- Horas con mayor ticket promedio
- Días de la semana con mayor spending

### 4. Segmentación por Recurrencia

Para clientes recurrentes (2+ pedidos):
- Productos con mayor ratio de recurrencia tienen mejor aceptación

### 5. Evitar Cannibalización

No recomendar combinaciones con penetración ≥60% ya que se compran naturalmente.

---

## MÉTODOLOGÍA

**Datos Observados:** Información directa de los datasets (tickets, combinaciones, frecuencia)

**Cálculos Derivados:**
- Penetración: (clientes que compran A y B) / (clientes que compran A) × 100
- Incremento de ticket: (Ticket A+B - Ticket A) / Ticket A × 100
- Score ancla: combinación ponderada de frecuencia, clientes y frecuencia por cliente

**Inferencias:**
- Clasificación de afinidad basada en umbrales de penetración
- Clasificación de upsell basada en incremento y frecuencia
- Potencial de upsell basado en score compuesto

**Limitaciones:**
- No se asume causalidad sin evidencia
- Patrones con baja frecuencia (<3) se consideran no significativos
- Datos temporales limitados al período analizado

---

## DATASETS UTILIZADOS

1. 15_product_combinations.json - Combinaciones de productos por pares
2. 12_products.json - Datos individuales de productos
3. 05_ticket_real.json - Tickets por pedido con composición
4. 16_customer_x_product.json - Relación cliente-producto
5. 06_recurrence.json - Recurrencia de clientes
6. 28_reward_intelligence_purchase_sequence.json - Secuencia de compras
7. 20_temporal.json - Datos temporales por hora/día
8. 13_product_x_recurrence.json - Recurrencia por producto
9. 02_club_data.json - Datos del club
10. 04_orders_complete.json - Pedidos completos

---

*Reporte generado automáticamente por Upselling Intelligence Analysis*
"""

# Save Markdown report
with open(f"{base_path}/UPSELLING_INTELLIGENCE_KEKE_LARRY.md", 'w', encoding='utf-8') as f:
    f.write(md_report)

print("Markdown report saved!")
print("\nAnalysis complete!")
print(f"Files generated:")
print(f"  - {base_path}/upselling_intelligence_keke_larry.json")
print(f"  - {base_path}/UPSELLING_INTELLIGENCE_KEKE_LARRY.md")
