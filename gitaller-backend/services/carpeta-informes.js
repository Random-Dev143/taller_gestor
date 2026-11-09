'use strict';
// Manejo de la carpeta donde se guardan los informes (sin base de datos).
const fs = require('fs');
const path = require('path');

// Verifica que la carpeta exista (la crea si hace falta) y que se pueda escribir.
function validarCarpeta(carpeta) {
    if (!carpeta || !String(carpeta).trim()) throw new Error('No hay carpeta configurada.');
    const dir = path.resolve(String(carpeta).trim());
    fs.mkdirSync(dir, { recursive: true });
    const prueba = path.join(dir, `.prueba_${process.pid}_${Date.now()}`);
    fs.writeFileSync(prueba, 'ok');
    fs.unlinkSync(prueba);
    return dir;
}

// Si el archivo ya existe agrega " (2)", " (3)"... para no pisar nada.
function rutaLibre(dir, nombre) {
    const { name, ext } = path.parse(nombre);
    let ruta = path.join(dir, nombre), n = 2;
    while (fs.existsSync(ruta)) ruta = path.join(dir, `${name} (${n++})${ext}`);
    return ruta;
}

module.exports = { validarCarpeta, rutaLibre };
