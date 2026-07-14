const jwt = require('jsonwebtoken');

// Importar la clave desde el .env
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("⚠️ CRÍTICO: No se ha definido JWT_SECRET en el archivo .env. El sistema de autenticación no puede funcionar de forma segura.");
    process.exit(1); // Detiene el servidor
}

const requireAuth = (rolesPermitidos = []) => {
    return (req, res, next) => {
        const token = req.cookies.auth_token;
        if (!token) return res.status(401).json({ error: 'Acceso denegado. Inicie sesión.' });

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.usuario = decoded;

            if (decoded.estado !== 'aprobado') {
                return res.status(403).json({ error: 'Su cuenta aún no ha sido aprobada.' });
            }

            if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(decoded.rol)) {
                return res.status(403).json({ error: 'No tiene permisos para acceder a esta sección.' });
            }

            next();
        } catch (error) {
            res.status(401).json({ error: 'Sesión inválida o expirada.' });
        }
    };
};

module.exports = { requireAuth, JWT_SECRET };