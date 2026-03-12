"""Quick script to verify project costs vs budget."""
from database import SessionLocal
import models

db = SessionLocal()
projects = db.query(models.Project).all()
settings = db.query(models.Settings).first()

total_cost = 0
for p in projects:
    total_cost += sum(p.flujo_caja.values())

budget = sum(settings.presupuesto_anual.values())

print(f"Costo total de {len(projects)} proyectos: {total_cost:,.0f} UF")
print(f"Presupuesto total (5 años): {budget:,.0f} UF")
print(f"Ratio demanda/oferta: {total_cost/budget:.2f}x")
print(f"\nEsto significa que {'la demanda EXCEDE al presupuesto ✅' if total_cost > budget else 'la demanda NO excede al presupuesto ❌'}")
print(f"El optimizador debe rechazar aprox. {max(0, total_cost - budget):,.0f} UF en proyectos")

# Per-year breakdown
print(f"\n--- Demanda vs Oferta por Año ---")
for y in range(5):
    year_demand = sum(p.flujo_caja.get(str(y), 0) for p in projects)
    year_budget = settings.presupuesto_anual.get(str(y), 0)
    print(f"  Año {y}: Demanda {year_demand:>8,.0f} | Presupuesto {year_budget:>8,.0f} | {'⚠️ EXCEDE' if year_demand > year_budget else '✅ ok'}")

db.close()
