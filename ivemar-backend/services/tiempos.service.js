// ivemar-backend/services/tiempos.service.js

// 1. Motor matemático base (Extraído de las rutas)
function calcularMinutosHabiles(startStr, endStr, estado, feriadosSet = new Set()) {
    if (!startStr) return 0;

    let start = new Date(startStr + 'Z');
    let end = endStr ? new Date(endStr + 'Z') : new Date();
    if (end < start) return 0;

    let totalMinutos = 0;
    let actual = new Date(start);
    let maxIterations = 2000;

    const modoExterno = (estado === 'Espera de Repuestos' || estado === 'Trabajos de Terceros');

    while (actual < end && maxIterations > 0) {
        maxIterations--;
        let dia = actual.getDay();
        let hora = actual.getHours();
        let esFeriado = feriadosSet.has(actual.toISOString().split('T')[0]);

        let enHorarioLaboral = false;
        let limiteCorte = 18;

        if (!esFeriado && dia >= 1 && dia <= 5) {
            if (modoExterno) {
                if (hora >= 8 && hora < 18) enHorarioLaboral = true;
                limiteCorte = 18;
            } else {
                if (hora >= 8 && hora < 13) { enHorarioLaboral = true; limiteCorte = 13; }
                else if (hora >= 14 && hora < 18) { enHorarioLaboral = true; limiteCorte = 18; }
            }
        } else if (!esFeriado && dia === 6) {
            if (hora >= 8 && hora < 13) { enHorarioLaboral = true; limiteCorte = 13; }
        }

        if (enHorarioLaboral) {
            let finBloque = new Date(actual);
            finBloque.setHours(limiteCorte, 0, 0, 0);
            let corte = (end < finBloque) ? end : finBloque;
            totalMinutos += (corte - actual) / 60000;
            actual = new Date(corte);
        } else {
            if (hora < 8) {
                actual.setHours(8, 0, 0, 0);
            } else if (!esFeriado && !modoExterno && dia >= 1 && dia <= 5 && hora >= 13 && hora < 14) {
                actual.setHours(14, 0, 0, 0);
            } else {
                actual.setDate(actual.getDate() + 1);
                actual.setHours(8, 0, 0, 0);
            }
        }
    }
    return totalMinutos;
}

// 2. Aquí agregaremos en el futuro la función para calcular Días Activos y Ocio.

module.exports = { calcularMinutosHabiles };