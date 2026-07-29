// Fachada de compatibilidad. Mantiene exactamente el mismo contrato público que
// tenía este archivo antes del refactor (mismos exports), para no tener que tocar
// todavía los ~15 archivos que hacen require('../config/database'). La implementación
// real ahora vive repartida en db/ (connection, migrator, migrations/, seed).
//
// TODO(paso 2): a medida que migremos cada ruta al patrón routes/service/repository,
// esas rutas van a importar directamente desde db/connection y desde el service de su
// propio módulo en vez de esta fachada. Cuando no quede ningún require('../config/database'),
// este archivo se borra.
const { db, run, all, get, withTransaction, DB_PATH } = require('../db/connection');
const { migrar } = require('../db/migrator');
const { ejecutarSeed } = require('../db/seed');
const {
    cambiarEstado,
    sincronizarEstadoOT,
    sincronizarEstadoActividad,
    recalcularTiempoEmpleado
} = require('../db/legacy-business-logic');

// Arranque: aplica migraciones pendientes y siembra los datos iniciales.
// Se ejecuta como efecto de borde al cargar el módulo, igual que antes.
(async () => {
    try {
        await migrar();
        await ejecutarSeed();
    } catch (error) {
        console.error('❌ Error inicializando la base de datos:', error.message);
    }
})();

module.exports = {
    db,
    run,
    all,
    get,
    withTransaction,
    DB_PATH,
    cambiarEstado,
    sincronizarEstadoOT,
    sincronizarEstadoActividad,
    recalcularTiempoEmpleado
};
