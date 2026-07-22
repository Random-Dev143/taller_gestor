// gitaller-backend/routes/auth.js
const express = require('express');
const router = express.Router();
const { run, get, all } = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { JWT_SECRET } = require('../middlewares/auth');

//CREAR ADMIN POR DEFECTO
async function asegurarAdmin() {
    try {
        const adminExiste = await get(`SELECT id FROM usuarios WHERE email = 'admin@gitaller.com'`);
        if (!adminExiste) {
            const hash = bcrypt.hashSync('gitaller123', 10);
            
            // Buscamos el ID del nuevo rol Administrador maestro
            const rol = await get(`SELECT id FROM roles WHERE nombre = 'Administrador'`);
            const rolId = rol ? rol.id : null;

            await run(
                `INSERT INTO usuarios (id, email, password_hash, nombre_completo, estado, rol, rol_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), 'admin@gitaller.com', hash, 'Administrador', 'aprobado', 'admin', rolId]
            );
            console.log('✅ Admin por defecto creado y vinculado a permisos granulares.');
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
        const nuevoId = crypto.randomUUID();

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
        // Obtenemos el usuario y el nombre de su rol relacional
        const usuario = await get(`
            SELECT u.*, r.nombre as rol_nombre 
            FROM usuarios u 
            LEFT JOIN roles r ON u.rol_id = r.id 
            WHERE u.email = ?
        `, [email]);
        
        if (!usuario) return res.status(401).json({ error: 'Credenciales inválidas' });

        const passwordValido = bcrypt.compareSync(password, usuario.password_hash);
        if (!passwordValido) return res.status(401).json({ error: 'Credenciales inválidas' });

        if (usuario.estado !== 'aprobado') {
            return res.status(403).json({ error: 'Su cuenta está pendiente de aprobación o suspendida.' });
        }

        // Buscamos el array de permisos exactos que tiene este rol
        let permisosArreglo = [];
        if (usuario.rol_id) {
            const permisosRaw = await all(`SELECT permiso_clave FROM rol_permisos WHERE rol_id = ?`, [usuario.rol_id]);
            permisosArreglo = permisosRaw.map(p => p.permiso_clave);
        }

        // Generamos el token incluyendo el nuevo array de permisos
        const payload = {
            id: usuario.id,
            email: usuario.email,
            nombre: usuario.nombre_completo,
            rol: usuario.rol_nombre, 
            rol_id: usuario.rol_id,
            legajo: usuario.legajo,
            estado: usuario.estado,
            permisos: permisosArreglo   
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

        // SOLUCIÓN CORS TAURI:
        // Para que la cookie de sesión funcione entre dominios distintos (ej: tauri://localhost
        // y http://127.0.0.1), es OBLIGATORIO usar SameSite=None.
        // `None` normalmente requiere que la cookie sea `Secure` (HTTPS), pero en un entorno de 
        // desarrollo local con Tauri sobre HTTP, debemos mantener `secure: false`.
        // Los webviews de Tauri suelen ser más permisivos con esta combinación que los navegadores estándar.
        // Para producción, lo ideal es servir frontend y backend desde el mismo dominio o usar HTTPS.
        res.cookie('auth_token', token, {
            httpOnly: true,
            sameSite: 'None',
            secure: false, // Debe ser false para desarrollo en HTTP
            maxAge: 12 * 60 * 60 * 1000 
        });

        res.json({ 
            status: 'Login exitoso', 
            usuario: payload 
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
