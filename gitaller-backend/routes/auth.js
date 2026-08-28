const express = require('express');
const router = express.Router();
const { run, get, all } = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { JWT_SECRET, extraerToken, obtenerUsuarioConPermisos, requireAuth } = require('../middlewares/auth');

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

    const existente = await get(`SELECT id FROM usuarios WHERE email = ?`, [email]);
    if (existente) return res.status(400).json({ error: 'El email ya está registrado' });

    const hash = bcrypt.hashSync(password, 10);
    const nuevoId = crypto.randomUUID();

    await run(
        `INSERT INTO usuarios (id, email, password_hash, nombre_completo) VALUES (?, ?, ?, ?)`,
        [nuevoId, email, hash, nombre_completo]
    );

    res.json({ status: 'Registro exitoso. Espere la aprobación del administrador.' });
});


// --- LOGIN ---
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

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

    // AUTENTICACIÓN VÍA BEARER TOKEN:
    // Se abandona el uso de cookies de sesión porque la app se usa desde
    // múltiples dispositivos en la red (PC con Tauri, celulares y TV vía
    // navegador), cada uno accediendo por una IP/origen distinto. Las
    // cookies con SameSite=None requieren HTTPS real (Secure) para que
    // los navegadores/webviews modernos las acepten, lo cual es
    // inviable de gestionar en varios dispositivos dentro de una LAN.
    // En su lugar, el token se devuelve en el body y el frontend lo
    // guarda y lo reenvía en el header "Authorization: Bearer <token>"
    // en cada request.
    res.json({
        status: 'Login exitoso',
        token,
        usuario: payload
    });
});

// --- VERIFICAR SESIÓN (Útil para que el frontend sepa si está logueado al recargar la página) ---
router.get('/me', async (req, res) => {
    const token = extraerToken(req);
    if (!token) return res.json({ loggedIn: false });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Igual que en requireAuth: no confiamos en los permisos/estado que
        // traía el token al momento del login — los recalculamos en vivo
        // contra la base para que checkSession() (llamado en cada
        // navegación del frontend) siempre refleje el estado actual real,
        // sin esperar a que expire el token de 12hs.
        const usuario = await obtenerUsuarioConPermisos(decoded.id);
        if (!usuario || usuario.estado !== 'aprobado') {
            return res.json({ loggedIn: false });
        }

        res.json({
            loggedIn: true,
            usuario: {
                id: usuario.id,
                email: usuario.email,
                nombre: usuario.nombre_completo,
                rol: usuario.rol_nombre,
                rol_id: usuario.rol_id,
                legajo: usuario.legajo,
                estado: usuario.estado,
                permisos: usuario.permisos
            }
        });
    } catch {
        res.json({ loggedIn: false });
    }
});

// --- LOGOUT ---
// Con Bearer token el "logout" es responsabilidad del cliente (borrar el
// token guardado localmente). Se deja la ruta por compatibilidad, pero ya
// no hay cookie que limpiar.
router.post('/logout', (req, res) => {
    res.json({ status: 'Sesión cerrada' });
});

// --- REFRESH (mantener sesión) ---
// Usado por el modal de aviso de sesión por vencer (ver
// useSessionExpiry.js en el frontend): mientras el token actual siga
// siendo válido, emite uno nuevo con 12hs más — sin pedir contraseña de
// nuevo. requireAuth([]) ya se encarga de rechazar si el token viejo
// expiró o el usuario fue desactivado, así que acá solo queda re-firmar.
router.post('/refresh', requireAuth([]), (req, res) => {
    const payload = {
        id: req.usuario.id,
        email: req.usuario.email,
        nombre: req.usuario.nombre_completo,
        rol: req.usuario.rol_nombre,
        rol_id: req.usuario.rol_id,
        legajo: req.usuario.legajo,
        estado: req.usuario.estado,
        permisos: req.usuario.permisos
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token });
});

module.exports = router;
