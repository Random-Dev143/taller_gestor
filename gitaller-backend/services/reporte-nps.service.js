'use strict';
// ─── PLANILLA DE NPS ────────────────────────────────────────────────
// Genera el Excel quincenal con el mismo formato que la planilla que usa el
// taller: se parte de templates/planilla_nps.xlsx (encabezado, anchos, tema,
// lista del desplegable y Hoja1 originales) y se completan las filas.
const path = require('path');
const ExcelJS = require('exceljs');
const { all, get } = require('../config/database');
const { calcularMotivo, MOTIVOS } = require('./nps-motivos');
const { tituloPeriodo, parseFecha } = require('./nps-periodos');

const TEMPLATE = path.join(__dirname, '..', 'templates', 'planilla_nps.xlsx');
const MAX_TEXTO = 30; // la planilla original corta Nombre y Modelo a 30 caracteres
const CHASIS_DESCONOCIDO = 'X111111';
const AMARILLO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
const ROJO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
const recortar = (s) => String(s || '').trim().slice(0, MAX_TEXTO);
const limpio = (s) => String(s == null ? '' : s).trim();

async function obtenerFilas(desde, hasta) {
    const ordenes = await all(`
        SELECT o.ot, o.es_garantia, o.es_no_iveco, o.fecha_cierre, o.anulada, o.motivo_descarte_manual,
               o.patente, strftime('%Y-%m', o.fecha_apertura, 'localtime') AS mes,
               u.unidad, u.chasis, u.contacto_nombre, u.contacto_apellido,
               u.telefono AS u_tel, u.correo AS u_mail,
               c.nombre, c.cuit, c.telefono AS c_tel, c.correo AS c_mail
        FROM ordenes o
        JOIN unidades u ON o.patente = u.patente
        JOIN clientes c ON u.cliente_id = c.id
        WHERE o.ot != '0000' AND date(o.fecha_apertura, 'localtime') BETWEEN ? AND ?
        ORDER BY CAST(o.ot AS INTEGER), o.ot
    `, [desde, hasta]);

    const tareas = await all(`
        SELECT a.ot, a.descripcion FROM actividades a JOIN ordenes o ON o.ot = a.ot
        WHERE o.ot != '0000' AND date(o.fecha_apertura, 'localtime') BETWEEN ? AND ?
    `, [desde, hasta]);
    const tareasPorOt = new Map();
    for (const t of tareas) {
        if (!tareasPorOt.has(t.ot)) tareasPorOt.set(t.ot, []);
        tareasPorOt.get(t.ot).push(t.descripcion);
    }

    return ordenes.map(o => ({
        ot: o.ot,
        nombre: limpio(o.nombre),
        cuit: limpio(o.cuit),
        contacto: `${limpio(o.contacto_nombre)} ${limpio(o.contacto_apellido)}`.trim(),
        telefono: limpio(o.u_tel) || limpio(o.c_tel),
        mail: limpio(o.u_mail) || limpio(o.c_mail),
        modelo: limpio(o.unidad),
        patente: limpio(o.patente),
        chasis: limpio(o.chasis),
        esGarantia: !!o.es_garantia,
        esIveco: !o.es_no_iveco,
        mes: o.mes,
        motivo: calcularMotivo({ orden: o, cliente: o.nombre, tareas: tareasPorOt.get(o.ot) || [] })
    }));
}

const COL = { ORDEN: 1, CONCESIONARIO: 2, SEDE: 3, NOMBRE: 4, ID_CLIENTE: 5, NPS: 6, CONTACTO: 7, TELEFONO: 8,
    CELULAR: 9, MAIL: 10, MODELO: 11, PATENTE: 12, CHASIS: 13, GARANTIA: 14, MES: 15, MOTIVO: 16, OBS: 17 };

const numeroSiEs = (v) => (/^\d+$/.test(String(v)) ? Number(v) : String(v));

async function generarPlanilla(desde, hasta) {
    const titulo = tituloPeriodo(desde, hasta);
    const filas = await obtenerFilas(desde, hasta);
    const cfg = (await get(`SELECT nps_concesionario, nps_sede FROM configuracion WHERE id = 1`)) || {};
    const concesionario = numeroSiEs(cfg.nps_concesionario || '7');
    const sede = numeroSiEs(cfg.nps_sede || '20');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(TEMPLATE);
    const ws = wb.worksheets[0];
    ws.name = titulo.slice(0, 31);

    // Estilo de la fila modelo (bordes, fuente, formato de fecha, alineación).
    const modelo = {};
    for (let c = 1; c <= 17; c++) modelo[c] = JSON.parse(JSON.stringify(ws.getRow(2).getCell(c).style || {}));

    filas.forEach((f, i) => {
        const r = i + 2;
        const row = ws.getRow(r);
        for (let c = 1; c <= 17; c++) row.getCell(c).style = JSON.parse(JSON.stringify(modelo[c]));
        const pon = (col, valor, { faltante = false, relleno = null } = {}) => {
            const cell = row.getCell(col);
            cell.value = valor === '' ? null : valor;
            if (faltante && valor === '') cell.fill = AMARILLO;
            if (relleno) cell.fill = relleno;
        };
        const [anio, mes] = f.mes.split('-').map(Number);

        pon(COL.ORDEN, numeroSiEs(f.ot));
        pon(COL.CONCESIONARIO, concesionario);
        pon(COL.SEDE, sede);
        pon(COL.NOMBRE, recortar(f.nombre), { faltante: true });
        pon(COL.ID_CLIENTE, f.cuit, { faltante: true });
        pon(COL.NPS, '');
        pon(COL.CONTACTO, f.contacto, { faltante: true });
        pon(COL.TELEFONO, f.telefono, { faltante: true });
        pon(COL.CELULAR, ''); // columna presente pero siempre vacía (y sin pintar)
        pon(COL.MAIL, f.mail, { faltante: true });
        pon(COL.MODELO, recortar(f.modelo), { faltante: true });
        pon(COL.PATENTE, f.patente, { faltante: true });
        if (f.chasis) pon(COL.CHASIS, f.chasis);
        else if (f.esIveco) pon(COL.CHASIS, '', { relleno: ROJO });      // Iveco sin chasis: celda roja
        else pon(COL.CHASIS, CHASIS_DESCONOCIDO);                         // otra marca: x111111
        pon(COL.GARANTIA, f.esGarantia ? 'SI' : 'NO');
        pon(COL.MES, new Date(Date.UTC(anio, mes - 1, 1)));
        pon(COL.MOTIVO, MOTIVOS.includes(f.motivo) ? f.motivo : '');
        pon(COL.OBS, '');
    });

    // Limpia la fila modelo si no hubo datos (el template la deja con estilo).
    const ultima = filas.length + 1;
    if (filas.length > 0) {
        for (let r = 2; r <= ultima; r++) {
            ws.getCell(`P${r}`).dataValidation = {
                type: 'list', allowBlank: true, formulae: ['$S$2:$S$11'],
                showInputMessage: true, showErrorMessage: true,
                errorTitle: 'Motivo no válido', error: 'Elija un valor de la lista desplegable.'
            };
        }
        ws.addConditionalFormatting({
            ref: `F2:F${ultima}`,
            rules: [{ type: 'iconSet', priority: 1, iconSet: '3TrafficLights1',
                cfvo: [{ type: 'percent', value: 0 }, { type: 'num', value: 7 }, { type: 'num', value: 9 }] }]
        });
    }

    const buffer = await wb.xlsx.writeBuffer();
    const nombreArchivo = `${titulo}.xlsx`.replace(/[\\/:*?"<>|]/g, '_');
    return { buffer: Buffer.from(buffer), nombreArchivo, titulo, filas: filas.length };
}

module.exports = { generarPlanilla, obtenerFilas, tituloPeriodo, parseFecha, CHASIS_DESCONOCIDO, MAX_TEXTO };
