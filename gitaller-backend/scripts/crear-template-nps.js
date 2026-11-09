'use strict';
// Genera templates/planilla_nps.xlsx a partir de una planilla modelo real.
// Uso: node scripts/crear-template-nps.js <planilla_modelo.xlsx>
// Conserva encabezado, anchos, tema, lista del desplegable (S2:S11) y Hoja1;
// deja UNA fila modelo (fila 2) con el estilo de las celdas de datos y borra
// el resto de los datos, rellenos, formatos condicionales y validaciones
// (el generador los vuelve a crear según la cantidad de filas).
const path = require('path');
const ExcelJS = require('exceljs');

(async () => {
    const origen = process.argv[2];
    if (!origen) { console.error('Falta la planilla modelo'); process.exit(1); }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(origen);
    const ws = wb.worksheets[0];
    const NINGUN_RELLENO = { type: 'pattern', pattern: 'none' };
    const ultima = ws.rowCount;
    for (let r = 2; r <= ultima; r++) {
        for (let c = 1; c <= 17; c++) {
            const cell = ws.getRow(r).getCell(c);
            const estilo = r === 2 ? { ...cell.style, fill: NINGUN_RELLENO } : {};
            cell.value = null;
            cell.style = estilo;
        }
    }
    ws.conditionalFormattings = [];
    ws.dataValidations.model = {};
    ws.name = 'NPS';
    ws.views = [{ ...ws.views[0], activeCell: 'A2', topLeftCell: 'A2' }];
    await wb.xlsx.writeFile(path.join(__dirname, '..', 'templates', 'planilla_nps.xlsx'));
    console.log('Template generado. Hojas:', wb.worksheets.map(s => s.name).join(', '));
})();
