// ivemar-backend/routes/auth.js
const express = require('express');
const router = express.Router();
const { run, get } = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { JWT_SECRET } = require('../middlewares/auth');

// --- CREACIÓN DEL ADMIN POR DEFECTO ---
async function asegurarAdmin() {
    try {
        const adminExiste = await get(`SELECT id FROM usuarios WHERE email = 'admin@ivemar.com'`);
        if (!adminExiste) {
            const hash = bcrypt.hashSync('ivemar123', 10);
            await run(
                `INSERT INTO usuarios (id, email, password_hash, nombre_completo, estado, rol) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [uuidv4(), 'admin@ivemar.com', hash, 'Administrador', 'aprobado', 'admin']
            );
            console.log('✅ Admin por defecto creado: admin@ivemar.com / ivemar123');
        }
    } catch (error) {
        console.error('❌ Error creando admin por defecto:', error.message);
    }
}
// Llamamos a la función al cargar el módulo
setTimeout(asegurarAdmin, 1000); 


// --- REGISTRO (Cualquiera puede registrarse) ---
router.post('/register', async (req, res) => {
    const { email, password, nombre_completo } = req.body;
    if (!email || !password || !nombre_completo) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    try {
        const existente = await get(`SELECT id FROM usuarios WHERE email = ?`, [email]);
        if (existente) return res.status(400).json({ error: 'El email ya está registrado' });

        const hash = bcrypt.hashSync(password, 10);
        const nuevoId = uuidv4();

        await run(
            `INSERT INTO usuarios (id, email, password_hash, nombre_completo) VALUES (?, ?, ?, ?)`,
            [nuevoId, email, hash, nombre_completo]
        );

        res.json({ status: 'Registro exitoso. Espere la aprobación del administrador.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// --- LOGIN ---
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const usuario = await get(`SELECT * FROM usuarios WHERE email = ?`, [email]);
        if (!usuario) return res.status(401).json({ error: 'Credenciales inválidas' });

        const passwordValido = bcrypt.compareSync(password, usuario.password_hash);
        if (!passwordValido) return res.status(401).json({ error: 'Credenciales inválidas' });

        if (usuario.estado !== 'aprobado') {
            return res.status(403).json({ error: 'Su cuenta está pendiente de aprobación o suspendida.' });
        }

        // Generamos el token (válido por 12 horas)
        const payload = {
            id: usuario.id,
            email: usuario.email,
            nombre: usuario.nombre_completo,
            rol: usuario.rol,
            legajo: usuario.legajo
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

        // Setear la cookie HttpOnly
        res.cookie('auth_token', token, {
            httpOnly: true,
            sameSite: 'Lax', // Permite el uso en red local HTTP
            secure: false,   // false para red local
            maxAge: 12 * 60 * 60 * 1000 // 12 horas
        });

        // Devolvemos datos básicos al frontend para la UI
        res.json({ 
            status: 'Login exitoso', 
            usuario: { email: usuario.email, nombre: usuario.nombre_completo, rol: usuario.rol, legajo: usuario.legajo } 
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- VERIFICAR SESIÓN (Útil para que el frontend sepa si está logueado al recargar la página) ---
router.get('/me', async (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) return res.json({ loggedIn: false });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ loggedIn: true, usuario: decoded });
    } catch {
        res.json({ loggedIn: false });
    }
});

// --- LOGOUT ---
router.post('/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.json({ status: 'Sesión cerrada' });
});

module.exports = router;