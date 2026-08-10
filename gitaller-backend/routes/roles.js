const express = require('express');
const router = express.Router();
const { run, all, get, withTransaction } = require('../config/database');
const crypto = require('crypto');

// 1. OBTENER CATÁLOGO DE PERMISOS (Para armar la UI de checkboxes)
router.get('/permisos', async (req, res) => {
    res.json(await all(`SELECT * FROM permisos ORDER BY modulo, clave`));
});

// 2. LISTAR ROLES CON SUS PERMISOS ASIGNADOS
router.get('/', async (req, res) => {
    const roles = await all(`SELECT * FROM roles ORDER BY nombre`);

    // Iteramos para buscar qué permisos tiene tildados cada rol
    for (let rol of roles) {
        const permisosRol = await all(`SELECT permiso_clave FROM rol_permisos WHERE rol_id = ?`, [rol.id]);
        // Guardamos solo el array de claves (Ej: ['ot_crear', 'ot_editar'])
        rol.permisos = permisosRol.map(p => p.permiso_clave);
    }

    res.json(roles);
});

// 3. CREAR UN ROL NUEVO
router.post('/', async (req, res) => {
    const { nombre, permisos } = req.body;

    if (!nombre) {
        return res.status(400).json({ error: 'El nombre del rol es obligatorio' });
    }

    // Caso 2: el catch traduce el UNIQUE constraint a un mensaje entendible.
    try {
        await withTransaction(async () => {
            const nuevoId = crypto.randomUUID();
            await run(`INSERT INTO roles (id, nombre) VALUES (?, ?)`, [nuevoId, nombre]);

            if (permisos && permisos.length > 0) {
                for (const p of permisos) {
                    await run(`INSERT INTO rol_permisos (rol_id, permiso_clave) VALUES (?, ?)`, [nuevoId, p]);
                }
            }
        });
        res.json({ status: 'Rol creado exitosamente' });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint')) {
            const e = new Error('Ya existe un rol con ese nombre');
            e.status = 400;
            throw e;
        }
        throw error;
    }
});

// 4. MODIFICAR UN ROL Y SUS PERMISOS
router.put('/:id', async (req, res) => {
    const { nombre, permisos } = req.body;
    const rol = await get(`SELECT es_sistema FROM roles WHERE id = ?`, [req.params.id]);
    if (!rol) return res.status(404).json({ error: 'Rol no encontrado' });

    await withTransaction(async () => {
        // Permitimos cambiar el nombre solo si NO es un rol base del sistema
        if (nombre && rol.es_sistema === 0) {
            await run(`UPDATE roles SET nombre = ? WHERE id = ?`, [nombre, req.params.id]);
        }

        // Para actualizar los permisos fácilmente: borramos todos los viejos e insertamos los nuevos
        await run(`DELETE FROM rol_permisos WHERE rol_id = ?`, [req.params.id]);

        if (permisos && permisos.length > 0) {
            for (const p of permisos) {
                await run(`INSERT INTO rol_permisos (rol_id, permiso_clave) VALUES (?, ?)`, [req.params.id, p]);
            }
        }
    });
    res.json({ status: 'Rol y permisos actualizados correctamente' });
});

// 5. ELIMINAR ROL
router.delete('/:id', async (req, res) => {
    // Bloqueo 1: Evitar que borren al Administrador (es_sistema = 1)
    const rol = await get(`SELECT es_sistema FROM roles WHERE id = ?`, [req.params.id]);
    if (rol && rol.es_sistema === 1) {
        return res.status(403).json({ error: 'Operación denegada. No se puede eliminar un rol nativo del sistema.' });
    }

    // Bloqueo 2: Evitar que dejen usuarios huérfanos sin rol
    const enUso = await get(`SELECT id FROM usuarios WHERE rol_id = ? LIMIT 1`, [req.params.id]);
    if (enUso) {
        return res.status(400).json({ error: 'No se puede eliminar el rol porque actualmente hay usuarios asignados a él.' });
    }

    // Si pasó los bloqueos, borramos (SQLite borrará automáticamente los registros en rol_permisos por el CASCADE)
    await run(`DELETE FROM roles WHERE id = ?`, [req.params.id]);
    res.json({ status: 'Rol eliminado exitosamente' });
});

module.exports = router;
