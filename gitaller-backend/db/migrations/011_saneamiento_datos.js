async function up({ run }) {
    await run(`UPDATE actividades SET estado = 'Asignada' WHERE estado = 'Pendiente'`);
    await run(`UPDATE actividades SET tiempo_real = 0 WHERE tiempo_real < 0`);
    await run(`UPDATE ordenes SET tiempo_empleado_horas = 0 WHERE tiempo_empleado_horas < 0`);
    await run(`UPDATE aportes SET horas = 0 WHERE horas < 0`);
}

module.exports = { up };
