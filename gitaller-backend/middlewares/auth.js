const jwt = require('jsonwebtoken');
const { get, all } = require('../config/database');
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("⚠️ CRÍTICO: No se ha definido JWT_SECRET en el archivo .env. El sistema de autenticación no puede funcionar de forma segura.");
    process.exit(1);
}

// Extrae el token del header "Authorization: Bearer <token>"
const extraerToken = (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }
    return null;
};

// Dado un id de usuario, calcula sus permisos EN VIVO contra la base.
// Antes esto se leía directamente de decoded.permisos (lo que el JWT traía
// grabado desde el momento del login) — el problema es que un token dura
// hasta 12hs, así que cualquier cambio de rol/permisos hecho por un Admin
// DESPUÉS de que la persona inició sesión no tenía ningún efecto hasta que
// el token expirara o la persona volviera a loguearse manualmente. Eso es
// tanto una fuente de bugs confusos ("le di el permiso pero no lo ve") como
// un agujero de seguridad real (revocar acceso a alguien no era inmediato).
// Se paga el costo de 1-2 consultas extra por pedido a cambio de que los
// cambios de permisos/rol se apliquen de inmediato, en el siguiente pedido.
async function obtenerUsuarioConPermisos(usuarioId) {
    const usuario = await get(`
        SELECT u.id, u.email, u.nombre_completo, u.rol_id, u.legajo, u.estado, r.nombre as rol_nombre
        FROM usuarios u
        LEFT JOIN roles r ON u.rol_id = r.id
        WHERE u.id = ?
    `, [usuarioId]);
    if (!usuario) return null;

    let permisos = [];
    if (usuario.rol_id) {
        const filas = await all(`SELECT permiso_clave FROM rol_permisos WHERE rol_id = ?`, [usuario.rol_id]);
        permisos = filas.map(f => f.permiso_clave);
    }
    return { ...usuario, permisos };
}

// Ahora recibe un array de permisos requeridos (Ej: ['ot_crear', 'ot_editar'])
const requireAuth = (permisosRequeridos = []) => {
    return async (req, res, next) => {
        const token = extraerToken(req);
        if (!token) return res.status(401).json({ error: 'Acceso denegado. Inicie sesión.' });

        try {
            const decoded = jwt.verify(token, JWT_SECRET);

            const usuario = await obtenerUsuarioConPermisos(decoded.id);
            if (!usuario) return res.status(401).json({ error: 'Sesión inválida: el usuario ya no existe.' });

            if (usuario.estado !== 'aprobado') {
                return res.status(403).json({ error: 'Su cuenta aún no ha sido aprobada o fue suspendida.' });
            }

            req.usuario = { ...decoded, ...usuario }; // nombre_completo/rol_id/permisos/estado siempre frescos

            // --- VALIDACIÓN GRANULAR ---
            if (permisosRequeridos.length > 0) {
                // Verificamos si el usuario tiene al menos UNO de los permisos requeridos para esta ruta
                const tienePermiso = permisosRequeridos.some(permiso => usuario.permisos.includes(permiso));

                if (!tienePermiso) {
                    return res.status(403).json({ error: 'No tiene los permisos necesarios para realizar esta acción.' });
                }
            }

            next();
        } catch (error) {
            res.status(401).json({ error: 'Sesión inválida o expirada.' });
        }
    };
};

module.exports = { requireAuth, obtenerUsuarioConPermisos, JWT_SECRET, extraerToken };
