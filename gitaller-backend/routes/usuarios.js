// ivemar-backend/routes/usuarios.js
const express = require('express');
const router = express.Router();
const { run, all, get } = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// GET / - Listar todos los usuarios (se puede filtrar por estado ?estado=pendiente)
router.get('/', async (req, res) => {
    const estado = req.query.estado;
    try {
        let query = `
            SELECT u.id, u.email, u.nombre_completo, u.estado, u.legajo, 
                   l.nombre as nombre_legajo, r.nombre as rol_nombre, u.rol_id
            FROM usuarios u
            LEFT JOIN legajos l ON u.legajo = l.legajo
            LEFT JOIN roles r ON u.rol_id = r.id
        `;
        const params = [];

        if (estado) {
            query += ` WHERE u.estado = ?`;
            params.push(estado);
        }

        query += ` ORDER BY u.nombre_completo ASC`;
        const usuarios = await all(query, params);
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST / - Creación manual de un usuario por el admin (ya aprobado directamente)
router.post('/', async (req, res) => {
    const { email, password, nombre_completo, rol, legajo } = req.body;
    if (!email || !password || !nombre_completo || !rol) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    try {
        const existente = await get(`SELECT id FROM usuarios WHERE email = ?`, [email]);
        if (existente) return res.status(400).json({ error: 'El email ya está registrado' });

        const hash = bcrypt.hashSync(password, 10);
        const nuevoId = crypto.randomUUID();

        await run(
            `INSERT INTO usuarios (id, email, password_hash, nombre_completo, estado, rol, legajo) 
             VALUES (?, ?, ?, ?, 'aprobado', ?, ?)`,
            [nuevoId, email, hash, nombre_completo, rol, legajo || null]
        );

        res.json({ status: 'Usuario creado y aprobado exitosamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /:id - Actualizar usuario (Aprobar, cambiar rol, asignar legajo)
router.put('/:id', async (req, res) => {
    const { estado, rol_id, legajo } = req.body;
    try {
        await run(
            `UPDATE usuarios SET estado = ?, rol_id = ?, legajo = ? WHERE id = ?`,
            [estado, rol_id || null, legajo || null, req.params.id]
        );
        res.json({ status: 'Usuario actualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /:id/password - Resetear contraseña (solo admin)
router.put('/:id/password', async (req, res) => {
    const { nueva_password } = req.body;
    if (!nueva_password || nueva_password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    try {
        const hash = bcrypt.hashSync(nueva_password, 10);
        await run(`UPDATE usuarios SET password_hash = ? WHERE id = ?`, [hash, req.params.id]);
        res.json({ status: 'Contraseña reseteada correctamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /:id - Baja lógica (suspender usuario para no romper el historial)
router.delete('/:id', async (req, res) => {
    try {
        // En lugar de borrar la fila (lo cual podría dejar OTs huérfanas si diseñáramos mal a futuro),
        // simplemente le quitamos el acceso cambiando el estado.
        await run(`UPDATE usuarios SET estado = 'suspendido' WHERE id = ?`, [req.params.id]);
        res.json({ status: 'Usuario suspendido. Ya no podrá iniciar sesión.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;