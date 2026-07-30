// Fachada de compatibilidad. Mantiene exactamente el mismo contrato público que
// tenía este archivo antes del refactor (mismos exports), para no tener que tocar
// todavía los archivos que hacen require('../config/database'). La implementación
// real vive repartida en db/ (connection, migrator, migrations/, seed) y en
// modules/ordenes y modules/actividades (reglas de negocio de OTs/actividades).
//
// Ya migrados al patrón routes/service/repository: ordenes, actividades.
// Pendientes de migrar (siguen usando esta fachada): auth, usuarios, roles, legajos,
// unidades, feriados, configuracion, informes, sala, cron.
// Cuando no quede ningún require('../config/database'), este archivo se borra.
const { db, run, all, get, withTransaction, DB_PATH } = require('../db/connection');
const { migrar } = require('../db/migrator');
const { ejecutarSeed } = require('../db/seed');
const ordenesService = require('../modules/ordenes/ordenes.service');
const actividadesService = require('../modules/actividades/actividades.service');

const cambiarEstado = ordenesService.cambiarEstado;
const sincronizarEstadoOT = ordenesService.sincronizarEstadoOT;
const recalcularTiempoEmpleado = ordenesService.recalcularTiempoEmpleado;
const sincronizarEstadoActividad = actividadesService.sincronizarEstadoActividad;

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
