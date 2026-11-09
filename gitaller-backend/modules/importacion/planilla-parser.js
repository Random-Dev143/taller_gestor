'use strict';
// Lee una planilla de NPS (.xlsx) y devuelve sus filas ya normalizadas.
const ExcelJS = require('exceljs');
const N = require('./normalizacion');

// Columnas que se leen (por nombre de encabezado, sin importar el orden).
const ENCABEZADOS = {
    orden: 'ot', nombre: 'nombre', idcliente: 'cuit', contacto: 'contacto', telefono: 'telefono',
    mail: 'correo', modelo: 'unidad', patente: 'patente', chasis: 'chasis', mes: 'mes'
};

function textoCelda(cell) {
    let v = cell.value;
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') {
        if (v.error) return '';                                   // #N/A y similares
        if (Array.isArray(v.richText)) v = v.richText.map(t => t.text).join('');
        else if (v.result !== undefined) v = (v.result && v.result.error) ? '' : v.result; // fórmula
        else if (v.text !== undefined) v = v.text;                // hipervínculo (mail)
        else return '';
    }
    return String(v).trim();
}

function fechaCelda(cell) {
    const v = cell.value;
    return v instanceof Date && !isNaN(v) ? v : null;
}

async function parsearPlanilla(buffer, archivo) {
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(buffer); }
    catch (e) { return { archivo, error: 'No se pudo abrir el archivo (¿es un .xlsx válido?).', filas: [] }; }

    // La hoja de datos es la que tiene encabezados "Orden" y "Patente" (se ignora Hoja1, etc.).
    for (const ws of wb.worksheets) {
        const cols = {};
        ws.getRow(1).eachCell((cell, n) => {
            const clave = ENCABEZADOS[N.norm(textoCelda(cell)).replace(/\s+/g, '')];
            if (clave && !cols[clave]) cols[clave] = n;
        });
        if (!cols.ot || !cols.patente) continue;

        const filas = [];
        let descartados = 0;
        for (let r = 2; r <= ws.rowCount; r++) {
            const row = ws.getRow(r);
            const patente = N.limpiarPatente(textoCelda(row.getCell(cols.patente)));
            if (!patente) { if (textoCelda(row.getCell(cols.patente))) descartados++; continue; }
            const leer = (clave, campo) => (cols[clave] ? N.limpiar(campo, textoCelda(row.getCell(cols[clave]))) : '');
            filas.push({
                archivo, hoja: ws.name, fila: r,
                ot: cols.ot ? textoCelda(row.getCell(cols.ot)).replace(/\.0+$/, '') : '',
                patente,
                nombre: leer('nombre', 'nombre'),
                cuit: leer('cuit', 'cuit'),
                contacto: leer('contacto', 'contacto'),
                telefono: leer('telefono', 'telefono'),
                correo: leer('correo', 'correo'),
                unidad: leer('unidad', 'unidad'),
                chasis: leer('chasis', 'chasis'),
                mes: cols.mes ? fechaCelda(row.getCell(cols.mes)) : null
            });
        }
        return { archivo, hoja: ws.name, filas, descartados };
    }
    return { archivo, error: 'No se encontró una hoja con las columnas "Orden" y "Patente".', filas: [] };
}

module.exports = { parsearPlanilla, textoCelda };
