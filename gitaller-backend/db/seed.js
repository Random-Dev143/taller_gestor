const crypto = require('crypto');
const { run, get } = require('./connection');

async function inicializarConfiguracionPorDefecto() {
    const conf = await get(`SELECT id FROM configuracion WHERE id = 1`);
    if (!conf) await run(`INSERT INTO configuracion (id) VALUES (1)`);
}

async function inicializarTallerInterno() {
    try {
        // 1. Obtener el nombre del taller desde la configuración
        const config = await get(`SELECT nombre_taller FROM configuracion WHERE id = 1`);
        const nombreTaller = (config && config.nombre_taller) ? config.nombre_taller.toUpperCase() : 'TALLER INTERNO';

        // 2. Asegurar Cliente dinámico
        let cli = await get(`SELECT id FROM clientes WHERE nombre = ?`, [nombreTaller]);
        if (!cli) {
            await run(`INSERT INTO clientes (nombre) VALUES (?)`, [nombreTaller]);
            cli = await get(`SELECT id FROM clientes WHERE nombre = ?`, [nombreTaller]);
        }

        // 3. Asegurar Unidad Interna
        let uni = await get(`SELECT id FROM unidades WHERE patente = 'INT000'`);
        if (!uni) {
            await run(`INSERT INTO unidades (patente, cliente_id, unidad) VALUES ('INT000', ?, 'TALLER INTERNO')`, [cli.id]);
        }

        // 4. Asegurar OT 0000
        let ot = await get(`SELECT ot FROM ordenes WHERE ot = '0000'`);
        if (!ot) {
            let asesor = await get(`SELECT legajo FROM legajos WHERE rol = 'asesor' LIMIT 1`);
            let legajo_asesor = asesor ? asesor.legajo : 'ADMIN';
            if (!asesor) await run(`INSERT OR IGNORE INTO legajos (legajo, nombre, rol) VALUES ('ADMIN', 'Sistema', 'asesor')`);

            await run(`INSERT INTO ordenes (ot, patente, asesor_legajo, fecha_apertura, estado_actual)
                       VALUES ('0000', 'INT000', ?, CURRENT_TIMESTAMP, 'En Proceso')`, [legajo_asesor]);
            console.log('✅ OT 0000 (Trabajos Internos) inicializada correctamente.');
        }
    } catch (error) {
        console.error('❌ Error inicializando OT Interna:', error.message);
    }
}

async function inicializarRolesYPermisos() {
    const permisosBase = [
        // Órdenes de Trabajo
        { clave: 'ot_ver_lista', modulo: 'Órdenes de Trabajo', desc: 'Acceder a la tabla general de OTs.' },
        { clave: 'ot_ver_detalle', modulo: 'Órdenes de Trabajo', desc: 'Ingresar a una OT específica para visualizar su interior.' },
        { clave: 'ot_crear', modulo: 'Órdenes de Trabajo', desc: 'Dar de alta nuevas OTs en el sistema.' },
        { clave: 'ot_editar', modulo: 'Órdenes de Trabajo', desc: 'Modificar la cabecera de la OT y montos.' },
        { clave: 'ot_cambiar_estado', modulo: 'Órdenes de Trabajo', desc: 'Forzar manualmente el estado de la orden.' },
        { clave: 'ot_controlar', modulo: 'Órdenes de Trabajo', desc: 'Ejecutar el Control de Calidad Final.' },
        { clave: 'ot_autorizar_descuento', modulo: 'Órdenes de Trabajo', desc: 'Aprobar o rechazar bonificaciones/descuentos cargados sobre una OT.' },
        // Tareas y Tiempos
        { clave: 'tarea_ver_propias', modulo: 'Tareas Operativas', desc: 'Ver exclusivamente las tareas asignadas a uno mismo.' },
        { clave: 'tarea_operar', modulo: 'Tareas Operativas', desc: 'Iniciar, pausar y finalizar tareas.' },
        { clave: 'tarea_gestionar_todas', modulo: 'Tareas Operativas', desc: 'Crear, asignar y eliminar cualquier tarea.' },
        { clave: 'tiempo_editar_manual', modulo: 'Tareas Operativas', desc: 'Corregir las horas de inicio y fin de una actividad.' },
        // Agenda
        { clave: 'agenda_ver', modulo: 'Agenda', desc: 'Consultar listado de clientes y vehículos.' },
        { clave: 'agenda_gestionar', modulo: 'Agenda', desc: 'Crear y editar clientes y vehículos.' },
        // Informes
        { clave: 'informe_financiero', modulo: 'Informes', desc: 'Acceso a métricas de dinero y facturación.' },
        { clave: 'informe_operativo', modulo: 'Informes', desc: 'Acceso a métricas de RRHH y eficacia.' },
        { clave: 'informe_taller', modulo: 'Informes', desc: 'Acceso a volumetría y cuellos de botella.' },
        // Personal
        { clave: 'legajo_ver', modulo: 'Personal', desc: 'Ver el listado del personal registrado.' },
        { clave: 'legajo_gestionar', modulo: 'Personal', desc: 'Crear altas/bajas de mecánicos y subir firmas.' },
        { clave: 'ausencia_justificar', modulo: 'Personal', desc: 'Cargar excepciones (Francos, Vacaciones).' },
        // Administración
        { clave: 'usuario_gestionar', modulo: 'Administración', desc: 'Aprobar solicitudes de cuentas y vincular legajos.' },
        { clave: 'rol_gestionar', modulo: 'Administración', desc: 'Crear nuevos perfiles y asignar permisos.' },
        { clave: 'repuesto_ver', modulo: 'Repuestos', desc: 'Ver el catálogo de repuestos y el stock disponible.' },
        { clave: 'repuesto_gestionar', modulo: 'Repuestos', desc: 'Crear/editar piezas, cargar facturas y modificar inventario.' }
    ];

    try {
        // 1. Inyectar todos los permisos asegurando que existan
        for (const p of permisosBase) {
            await run(`INSERT OR IGNORE INTO permisos (clave, modulo, descripcion) VALUES (?, ?, ?)`, [p.clave, p.modulo, p.desc]);
        }

        // 2. Asegurar que exista el Rol "Administrador" (es_sistema = 1)
        let adminRol = await get(`SELECT id FROM roles WHERE nombre = 'Administrador'`);
        if (!adminRol) {
            const nuevoId = crypto.randomUUID();
            await run(`INSERT INTO roles (id, nombre, es_sistema) VALUES (?, 'Administrador', 1)`, [nuevoId]);
            adminRol = { id: nuevoId };
        }

        // 3. Asignar TODOS los permisos al rol Administrador
        for (const p of permisosBase) {
            await run(`INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_clave) VALUES (?, ?)`, [adminRol.id, p.clave]);
        }

        // 4. Migrar el usuario Admin por defecto para que use este nuevo rol
        await run(`UPDATE usuarios SET rol_id = ? WHERE rol = 'admin' OR email = 'admin@ivemar.com'`, [adminRol.id]);

        console.log('🛡️ Permisos y roles base inicializados correctamente.');
    } catch (error) {
        console.error('❌ Error inicializando permisos:', error.message);
    }
}

async function ejecutarSeed() {
    await inicializarConfiguracionPorDefecto();
    await inicializarTallerInterno();
    await inicializarRolesYPermisos();
}

module.exports = { ejecutarSeed, inicializarTallerInterno, inicializarRolesYPermisos, inicializarConfiguracionPorDefecto };
