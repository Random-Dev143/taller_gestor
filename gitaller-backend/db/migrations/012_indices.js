async function up({ run }) {
    const indices = [
        `CREATE INDEX IF NOT EXISTS idx_actividades_ot ON actividades(ot)`,
        `CREATE INDEX IF NOT EXISTS idx_actividades_legajo ON actividades(legajo_mecanico)`,
        `CREATE INDEX IF NOT EXISTS idx_actividades_estado ON actividades(estado)`,
        `CREATE INDEX IF NOT EXISTS idx_asignaciones_ot ON asignaciones(ot)`,
        `CREATE INDEX IF NOT EXISTS idx_estados_historial_ot ON estados_historial(ot)`,
        `CREATE INDEX IF NOT EXISTS idx_aportes_ot ON aportes(ot)`,
        `CREATE INDEX IF NOT EXISTS idx_tiempos_actividad_actividad_id ON tiempos_actividad(actividad_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tiempos_actividad_legajo ON tiempos_actividad(legajo_mecanico)`,
        `CREATE INDEX IF NOT EXISTS idx_actividad_mecanicos_legajo ON actividad_mecanicos(legajo_mecanico)`,
        `CREATE INDEX IF NOT EXISTS idx_ordenes_fecha_apertura ON ordenes(fecha_apertura)`,
        `CREATE INDEX IF NOT EXISTS idx_ordenes_fecha_cierre ON ordenes(fecha_cierre)`,
        `CREATE INDEX IF NOT EXISTS idx_ordenes_estado_actual ON ordenes(estado_actual)`,
        `CREATE INDEX IF NOT EXISTS idx_legajos_rol ON legajos(rol)`
    ];
    for (const sql of indices) await run(sql);
}

module.exports = { up };
