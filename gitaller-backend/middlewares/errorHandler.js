// Middleware global de manejo de errores.
//
// Reemplaza los ~59 bloques try/catch idénticos que estaban desperdigados
// por las rutas, todos terminando en:
//   res.status(500).json({ error: error.message })
//
// Cómo funciona: Express 5 (a diferencia de Express 4) atrapa automáticamente
// las promesas rechazadas de un route handler `async` y las reenvía acá vía
// next(error) — no hace falta ningún wrapper tipo asyncHandler ni try/catch
// manual en cada ruta. Alcanza con:
//
//   router.post('/', async (req, res) => {
//       const cosa = await get(`SELECT ...`);
//       if (!cosa) throw new Error('No encontrado'); // <- Express 5 lo atrapa solo
//       res.json(cosa);
//   });
//
// IMPORTANTE: este middleware se registra en server.js DESPUÉS de todas las
// rutas (Express lo reconoce como manejador de errores por tener 4
// parámetros, no por dónde está declarado en el archivo, pero por
// convención y claridad va al final).
function errorHandler(err, req, res, next) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl} —`, err.message);
    if (err.stack) console.error(err.stack);

    // Algunas rutas ya lanzan errores con un status HTTP explícito, por
    // ejemplo: `const e = new Error('Ya existe'); e.status = 400; throw e;`
    // Si no lo especifican, se mantiene el 500 genérico que ya usaban todas
    // las rutas antes de este middleware (no cambia el comportamiento
    // observable para el frontend, que ya sabe manejar cualquier status).
    const status = err.status || err.statusCode || 500;

    res.status(status).json({ error: err.message || 'Error interno del servidor' });
}

module.exports = errorHandler;
