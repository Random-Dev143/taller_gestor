const express = require('express');
const router = express.Router();
const { getFinanciero, getOperativo, getTaller } = require('../services/informes.service');

// Función auxiliar para parsear las fechas de las peticiones
function parseFechas(req) {
    let inicio, fin, textoRango;
    if (req.query.desde && req.query.hasta) {
        inicio = req.query.desde;
        fin = new Date(new Date(req.query.hasta + 'T00:00:00Z').getTime() + 86400000).toISOString().split('T')[0];
        textoRango = `${req.query.desde} al ${req.query.hasta}`;
    } else {
        const mes = req.query.mes || new Date().toISOString().substring(0, 7);
        inicio = `${mes}-01`;
        const [anio, mesNum] = mes.split('-').map(Number);
        fin = new Date(Date.UTC(anio, mesNum, 1)).toISOString().split('T')[0];
        textoRango = mes;
    }

    const diasRango = Math.round((new Date(fin + 'T00:00:00Z') - new Date(inicio + 'T00:00:00Z')) / 86400000);
    const inicioAnterior = new Date(new Date(inicio + 'T00:00:00Z').getTime() - diasRango * 86400000).toISOString().split('T')[0];

    return { inicio, fin, inicioAnterior, finAnterior: inicio, textoRango };
}

// NUEVAS RUTAS MODULARES (Preparadas para la Fase 2)
router.get('/mensual/financiero', async (req, res) => {
    const { inicio, fin, inicioAnterior, finAnterior } = parseFechas(req);
    res.json(await getFinanciero(inicio, fin, inicioAnterior, finAnterior));
});

router.get('/mensual/operativo', async (req, res) => {
    const { inicio, fin } = parseFechas(req);
    res.json(await getOperativo(inicio, fin));
});

router.get('/mensual/taller', async (req, res) => {
    const { inicio, fin } = parseFechas(req);
    res.json(await getTaller(inicio, fin, req.query.filtro_cuellos));
});


// RUTA LEGACY (Mantiene vivo al Frontend actual)
router.get('/mensual', async (req, res) => {
    const fechas = parseFechas(req);

    // Ejecutamos los 3 servicios en paralelo para mayor velocidad
    const [financiero, operativo, taller] = await Promise.all([
        getFinanciero(fechas.inicio, fechas.fin, fechas.inicioAnterior, fechas.finAnterior),
        getOperativo(fechas.inicio, fechas.fin),
        getTaller(fechas.inicio, fechas.fin, req.query.filtro_cuellos)
    ]);

    // Ensamblamos y devolvemos exactamente lo mismo que devolvía antes
    res.json({
        mes: fechas.textoRango,
        ...financiero,
        ...operativo,
        ...taller
    });
});

module.exports = router;
