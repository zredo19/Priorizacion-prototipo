"""
fix_vir_rmi.py
Asigna valores realistas de VIR y RMI a todos los proyectos que tengan ambos en 0.
Los valores se generan con distribuciones distintas por categoría para simular
el comportamiento real del Excel (donde la columna MAX(VIR/RMI) varía por tipo).
"""
import psycopg2
import random
import math

random.seed(42)  # Reproducible

# --- Rangos de VIR y RMI por categoría (basados en la lógica de negocio real) ---
# VIR = Valor Importancia Relativa (0-100), ligado al impacto financiero/tarifario
# RMI = Risk Management Index (0-100), ligado al riesgo que mitiga el proyecto
CATEGORY_PROFILES = {
    "REPOSICIÓN":            {"vir_range": (1,  30), "rmi_range": (15, 85)},  # Alto riesgo por deterioro
    "MEJORAS":               {"vir_range": (5,  45), "rmi_range": (10, 60)},  # Mejora servicio
    "CRECIMIENTO":           {"vir_range": (20, 80), "rmi_range": (5,  40)},  # Alto valor financiero
    "TARIFA":                {"vir_range": (30, 95), "rmi_range": (20, 75)},  # Comprometido en tarifa: ambos altos
    "ACTIVACIÓN FINANCIERA": {"vir_range": (40, 90), "rmi_range": (5,  30)},  # Muy alto VIR, bajo riesgo
    "FILIALES":              {"vir_range": (5,  35), "rmi_range": (5,  35)},  # Periférico, valores moderados
}

DEFAULT_PROFILE = {"vir_range": (5, 50), "rmi_range": (5, 50)}


def generate_realistic_value(low, high):
    """Genera un valor flotante realista con 1 decimal, distribuido con sesgo hacia el centro."""
    # Usa una distribución beta para que los extremos sean menos frecuentes
    beta_val = random.betavariate(2, 3)  # Sesgado hacia valores bajos-medios
    value = low + beta_val * (high - low)
    return round(value, 1)


def fix_projects():
    conn = psycopg2.connect(
        dbname="capex_db",
        user="capex_user",
        password="capex_password",
        host="localhost",
        port="5434"
    )
    cur = conn.cursor()

    # Obtener todos los proyectos con VIR=0 Y RMI=0
    cur.execute("SELECT id, categoria, estado FROM projects WHERE vir = 0 AND rmi = 0")
    projects_to_fix = cur.fetchall()

    print(f"Proyectos a corregir: {len(projects_to_fix)}")

    updated = 0
    for proj_id, categoria, estado in projects_to_fix:
        profile = CATEGORY_PROFILES.get(categoria, DEFAULT_PROFILE)
        
        new_vir = generate_realistic_value(*profile["vir_range"])
        new_rmi = generate_realistic_value(*profile["rmi_range"])

        # Los proyectos adjudicados (FORZADOS) suelen tener RMI muy alto
        if estado and estado.lower() == "adjudicado":
            new_rmi = round(random.uniform(70, 100), 1)

        cur.execute(
            "UPDATE projects SET vir = %s, rmi = %s WHERE id = %s",
            (new_vir, new_rmi, proj_id)
        )
        updated += 1

    conn.commit()
    
    # Verificación final
    cur.execute("SELECT COUNT(*) FROM projects WHERE vir = 0 AND rmi = 0")
    remaining_zeros = cur.fetchone()[0]
    
    cur.execute("SELECT AVG(vir), AVG(rmi), MIN(vir), MAX(vir), MIN(rmi), MAX(rmi) FROM projects")
    stats = cur.fetchone()
    
    print(f"\n✅ Proyectos actualizados: {updated}")
    print(f"❌ Proyectos que siguen con 0 en ambos: {remaining_zeros}")
    print(f"\n📊 Estadísticas finales:")
    print(f"   VIR  — Promedio: {stats[0]:.1f} | Min: {stats[2]:.1f} | Max: {stats[3]:.1f}")
    print(f"   RMI  — Promedio: {stats[1]:.1f} | Min: {stats[4]:.1f} | Max: {stats[5]:.1f}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    fix_projects()
