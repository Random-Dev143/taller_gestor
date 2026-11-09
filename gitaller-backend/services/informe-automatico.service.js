'use strict';
// ─── INFORME NPS AUTOMÁTICO (cada quincena) ─────────────────────────
// Genera la planilla del período recién cerrado y la GUARDA en la carpeta
// configurada. No la envía a nadie: el control y la supervisión son humanos.
//   Período 1: del 1 al 15            -> se genera a partir del día 16
//   Período 2: del 16 a fin de mes    -> se genera a partir del día 1 del mes siguiente
// Se dispara desde el cron (cada 60 s). Es idempotente: queda un registro en
// informes_generados y no se vuelve a generar el mismo período. Si la PC
// estaba apagada el día 16 (o el 1), se genera en el primer arranque posterior.
const fs = require('fs');
const { run, get } = require('../config/database');
const { generarPlanilla } = require('./reporte-nps.service');
const { periodoCerradoReciente } = require('./nps-periodos');
const { validarCarpeta, rutaLibre } = require('./carpeta-informes');

const REINTENTO_MS = 60 * 60 * 1000; // si falla (carpeta inaccesible), reintenta cada hora

async function registrar({ desde, hasta, origen, ruta = '', filas = 0, error = '' }) {
    await run(`INSERT INTO informes_generados (tipo, desde, hasta, origen, ruta, filas, error) VALUES ('nps', ?, ?, ?, ?, ?, ?)`,
        [desde, hasta, origen, ruta, filas, error]);
}

async function generarYGuardar({ desde, hasta, origen = 'auto', carpeta }) {
    const dir = validarCarpeta(carpeta);
    const { buffer, nombreArchivo, filas } = await generarPlanilla(desde, hasta);
    const ruta = rutaLibre(dir, nombreArchivo);
    fs.writeFileSync(ruta, buffer);
    await registrar({ desde, hasta, origen, ruta, filas });
    return { ruta, filas };
}

let ultimoIntentoFallido = 0;

async function verificarInformeAutomatico(ahora = new Date()) {
    const cfg = await get(`SELECT carpeta_informes, informe_auto_activo FROM configuracion WHERE id = 1`);
    if (!cfg || cfg.informe_auto_activo === 0 || !String(cfg.carpeta_informes || '').trim()) return null;

    const { desde, hasta } = periodoCerradoReciente(ahora);
    const hecho = await get(`SELECT id FROM informes_generados WHERE tipo = 'nps' AND origen = 'auto' AND desde = ? AND hasta = ? AND error = ''`, [desde, hasta]);
    if (hecho) return null;
    if (Date.now() - ultimoIntentoFallido < REINTENTO_MS) return null;

    try {
        const res = await generarYGuardar({ desde, hasta, origen: 'auto', carpeta: cfg.carpeta_informes });
        console.log(`📄 Informe NPS automático generado (${desde} a ${hasta}): ${res.ruta}`);
        return res;
    } catch (error) {
        ultimoIntentoFallido = Date.now();
        console.error(`[INFORME] No se pudo generar el informe automático ${desde} a ${hasta}:`, error.message);
        await registrar({ desde, hasta, origen: 'auto', error: error.message }).catch(() => {});
        return null;
    }
}

const _reiniciarReintento = () => { ultimoIntentoFallido = 0; };

module.exports = { generarYGuardar, verificarInformeAutomatico, registrar, _reiniciarReintento };
