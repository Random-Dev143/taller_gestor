const { run, all, get } = require('../../db/connection');

// -- actividades --

function crear(ot, descripcion, tiempo_estimado, legajo_representante) {
    return run(
        `INSERT INTO actividades (ot, descripcion, tiempo_estimado, legajo_mecanico, estado) VALUES (?, ?, ?, ?, 'Asignada')`,
        [ot, descripcion, tiempo_estimado, legajo_representante]
    );
}

function obtenerPorId(id) {
    return get(`SELECT * FROM actividades WHERE id = ?`, [id]);
}

function actualizarDatosBasicos(id, { descripcion, tiempo_estimado, fecha_inicio, fecha_fin }) {
    return run(
        `UPDATE actividades
         SET descripcion = ?, tiempo_estimado = ?,
             fecha_inicio = COALESCE(NULLIF(?, ''), fecha_inicio),
             fecha_fin = COALESCE(NULLIF(?, ''), fecha_fin)
         WHERE id = ?`,
        [descripcion, tiempo_estimado, fecha_inicio, fecha_fin, id]
    );
}

function actualizarLegajoRepresentante(id, legajo) {
    return run(`UPDATE actividades SET legajo_mecanico = ? WHERE id = ?`, [legajo, id]);
}

function actualizarEstadoYTiempoAgregado(id, estado, tiempoReal) {
    return run(`UPDATE actividades SET estado = ?, tiempo_real = ? WHERE id = ?`, [estado, tiempoReal, id]);
}

function actualizarAutoPausa(id, valor) {
    return run(`UPDATE actividades SET auto_pausa = ? WHERE id = ?`, [valor, id]);
}

function cerrarPorJefe(ot) {
    return run(`UPDATE actividades SET estado = 'Cerrada por Jefe' WHERE ot = ? AND estado NOT IN ('Finalizada', 'Cerrada por Jefe')`, [ot]);
}

function eliminar(id) {
    return run(`DELETE FROM actividades WHERE id = ?`, [id]);
}

function listarPorOt(ot) {
    return all(`
        SELECT a.*,
        COALESCE(
            (SELECT GROUP_CONCAT(l.nombre, ', ') FROM actividad_mecanicos am JOIN legajos l ON am.legajo_mecanico = l.legajo WHERE am.actividad_id = a.id),
            (SELECT nombre FROM legajos WHERE legajo = a.legajo_mecanico)
        ) AS nombre_mecanico,
        COALESCE(
            (SELECT GROUP_CONCAT(am.legajo_mecanico, ',') FROM actividad_mecanicos am WHERE am.actividad_id = a.id),
            a.legajo_mecanico
        ) AS legajos_mecanicos,
        -- Detalle por mecánico: "Nombre|Estado|Horas" por integrante, separado por ';;'.
        -- Permite que el Jefe vea quién ya terminó su parte y quién sigue trabajando,
        -- en vez de solo el estado agregado de la tarea.
        (SELECT GROUP_CONCAT(l.nombre || '|' || am.estado || '|' || am.tiempo_real, ';;')
         FROM actividad_mecanicos am JOIN legajos l ON am.legajo_mecanico = l.legajo
         WHERE am.actividad_id = a.id) AS equipo_detalle
        FROM actividades a
        WHERE a.ot = ?
    `, [ot]);
}

function contarEstadosPorOt(ot) {
    return all(`SELECT estado FROM actividades WHERE ot = ?`, [ot]);
}

// -- actividad_mecanicos (equipo) --

function agregarMiembro(actividadId, legajo) {
    return run(`INSERT INTO actividad_mecanicos (actividad_id, legajo_mecanico, estado, tiempo_real) VALUES (?, ?, 'Asignada', 0)`, [actividadId, legajo]);
}

function quitarMiembro(actividadId, legajo) {
    return run(`DELETE FROM actividad_mecanicos WHERE actividad_id = ? AND legajo_mecanico = ?`, [actividadId, legajo]);
}

function listarMiembros(actividadId) {
    return all(`SELECT legajo_mecanico FROM actividad_mecanicos WHERE actividad_id = ?`, [actividadId]);
}

function listarMiembrosConEstado(actividadId) {
    return all(`SELECT estado, tiempo_real FROM actividad_mecanicos WHERE actividad_id = ?`, [actividadId]);
}

function obtenerMiembro(actividadId, legajo) {
    return get(`SELECT * FROM actividad_mecanicos WHERE actividad_id = ? AND legajo_mecanico = ?`, [actividadId, legajo]);
}

function actualizarEstadoMiembro(actividadId, legajo, estado) {
    return run(`UPDATE actividad_mecanicos SET estado = ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [estado, actividadId, legajo]);
}

function incrementarTiempoMiembro(actividadId, legajo, horas) {
    return run(`UPDATE actividad_mecanicos SET tiempo_real = tiempo_real + ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [horas, actividadId, legajo]);
}

function incrementarTiempoYEstadoMiembro(actividadId, legajo, horas, estado) {
    return run(`UPDATE actividad_mecanicos SET tiempo_real = tiempo_real + ?, estado = ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [horas, estado, actividadId, legajo]);
}

function decrementarTiempoMiembro(actividadId, legajo, horas) {
    return run(`UPDATE actividad_mecanicos SET tiempo_real = MAX(0, tiempo_real - ?) WHERE actividad_id = ? AND legajo_mecanico = ?`, [horas, actividadId, legajo]);
}

function fijarTiempoMiembro(actividadId, legajo, tiempo) {
    return run(`UPDATE actividad_mecanicos SET tiempo_real = ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [tiempo, actividadId, legajo]);
}

function sumaTiempoDeOtrosMiembros(actividadId, legajoExcluido) {
    return get(`SELECT COALESCE(SUM(tiempo_real),0) AS s FROM actividad_mecanicos WHERE actividad_id = ? AND legajo_mecanico != ?`, [actividadId, legajoExcluido]);
}

function actualizarInformeMiembro(actividadId, legajo, informe) {
    return run(`UPDATE actividad_mecanicos SET informe = ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [informe, actividadId, legajo]);
}

function otrasActividadesEnCursoDelMecanico(legajo, actividadIdExcluida) {
    return all(`
        SELECT am.actividad_id AS id, a.ot FROM actividad_mecanicos am
        JOIN actividades a ON a.id = am.actividad_id
        WHERE am.legajo_mecanico = ? AND am.estado = 'En Curso' AND am.actividad_id != ?
    `, [legajo, actividadIdExcluida]);
}

function listarPorMecanico(legajo) {
    return all(`
        SELECT a.*,
               am.estado AS mi_estado, am.tiempo_real AS mi_tiempo_real, am.informe AS mi_informe,
               (SELECT ta.inicio FROM tiempos_actividad ta WHERE ta.actividad_id = a.id AND ta.legajo_mecanico = am.legajo_mecanico AND ta.fin IS NULL ORDER BY ta.id DESC LIMIT 1) AS mi_sesion_inicio,
               o.patente, u.unidad, c.nombre AS cliente,
               (SELECT GROUP_CONCAT(l.nombre, ', ') FROM actividad_mecanicos am2 JOIN legajos l ON am2.legajo_mecanico = l.legajo WHERE am2.actividad_id = a.id) AS equipo
        FROM actividad_mecanicos am
        JOIN actividades a ON a.id = am.actividad_id
        JOIN ordenes o ON a.ot = o.ot
        JOIN unidades u ON o.patente = u.patente
        JOIN clientes c ON u.cliente_id = c.id
        WHERE am.legajo_mecanico = ? AND am.estado != 'Finalizada'
        ORDER BY a.id
    `, [legajo]);
}

// -- tiempos_actividad (sesiones) --

function iniciarSesion(actividadId, legajo) {
    return run(`INSERT INTO tiempos_actividad (actividad_id, legajo_mecanico, inicio) VALUES (?, ?, CURRENT_TIMESTAMP)`, [actividadId, legajo]);
}

function insertarSesion(actividadId, legajo, inicio, fin) {
    return run(`INSERT INTO tiempos_actividad (actividad_id, legajo_mecanico, inicio, fin) VALUES (?, ?, ?, ?)`, [actividadId, legajo || null, inicio, fin || null]);
}

function obtenerSesionAbierta(actividadId, legajo) {
    return get(`SELECT id, inicio FROM tiempos_actividad WHERE actividad_id = ? AND legajo_mecanico = ? AND fin IS NULL ORDER BY id DESC LIMIT 1`, [actividadId, legajo]);
}

function cerrarSesion(id) {
    return run(`UPDATE tiempos_actividad SET fin = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
}

function obtenerSesion(id) {
    return get(`SELECT actividad_id, legajo_mecanico FROM tiempos_actividad WHERE id = ?`, [id]);
}

function obtenerSesionCompleta(id) {
    return get(`SELECT actividad_id, legajo_mecanico, inicio, fin FROM tiempos_actividad WHERE id = ?`, [id]);
}

function actualizarSesion(id, inicio, fin) {
    return run(`UPDATE tiempos_actividad SET inicio = ?, fin = ? WHERE id = ?`, [inicio, fin, id]);
}

function eliminarSesion(id) {
    return run(`DELETE FROM tiempos_actividad WHERE id = ?`, [id]);
}

function eliminarSesionesPorActividad(actividadId) {
    return run(`DELETE FROM tiempos_actividad WHERE actividad_id = ?`, [actividadId]);
}

function listarSesionesCerradasDelMecanico(actividadId, legajo) {
    return all(`SELECT inicio, fin FROM tiempos_actividad WHERE actividad_id = ? AND legajo_mecanico = ? AND fin IS NOT NULL`, [actividadId, legajo]);
}

module.exports = {
    crear, obtenerPorId, actualizarDatosBasicos, actualizarLegajoRepresentante,
    actualizarEstadoYTiempoAgregado, actualizarAutoPausa, cerrarPorJefe, eliminar,
    listarPorOt, contarEstadosPorOt,
    agregarMiembro, quitarMiembro, listarMiembros, listarMiembrosConEstado, obtenerMiembro,
    actualizarEstadoMiembro, incrementarTiempoMiembro, incrementarTiempoYEstadoMiembro,
    decrementarTiempoMiembro, fijarTiempoMiembro, sumaTiempoDeOtrosMiembros,
    actualizarInformeMiembro, otrasActividadesEnCursoDelMecanico, listarPorMecanico,
    iniciarSesion, insertarSesion, obtenerSesionAbierta, cerrarSesion, obtenerSesion,
    obtenerSesionCompleta, actualizarSesion, eliminarSesion, eliminarSesionesPorActividad,
    listarSesionesCerradasDelMecanico
};
