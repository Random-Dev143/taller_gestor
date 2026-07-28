const jwt = require('jsonwebtoken');
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

// Ahora recibe un array de permisos requeridos (Ej: ['ot_crear', 'ot_editar'])
const requireAuth = (permisosRequeridos = []) => {
    return (req, res, next) => {
        const token = extraerToken(req);
        if (!token) return res.status(401).json({ error: 'Acceso denegado. Inicie sesión.' });

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.usuario = decoded;

            if (decoded.estado !== 'aprobado') {
                return res.status(403).json({ error: 'Su cuenta aún no ha sido aprobada.' });
            }

            // --- VALIDACIÓN GRANULAR ---
            if (permisosRequeridos.length > 0) {
                // Verificamos si el usuario tiene al menos UNO de los permisos requeridos para esta ruta
                const tienePermiso = permisosRequeridos.some(permiso => decoded.permisos.includes(permiso));

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

module.exports = { requireAuth, JWT_SECRET, extraerToken };