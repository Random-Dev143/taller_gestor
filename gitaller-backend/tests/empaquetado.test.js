'use strict';
// ─── EMPAQUETADO CON pkg ─────────────────────────────────────────────
// Bug real que motivó este test: db/migrator.js descubre las migraciones en
// runtime (fs.readdirSync + require(path.join(dir, f))). `pkg`, que arma el
// .exe de producción, solo empaqueta lo que detecta por análisis estático de
// require('literal'), así que el directorio db/migrations NO quedaba dentro
// del ejecutable: en el .exe, migrar() fallaba al leer la carpeta y no
// corría NINGUNA migración (ni el seed, que va después). Con `node server.js`
// todo funcionaba perfecto, por eso ninguna prueba lo detectó.
//
// Síntoma en producción: columnas nuevas (ej: trabaja_sabados) que nunca se
// crearon -> "SQLITE_ERROR: no such column" al guardar Configuración, y el
// cron sin disparar acciones. Reproducido con pkg real: "Directory
// .../db/migrations was not included into executable at compilation stage".
//
// No se corre pkg acá (descarga binarios base, es lento): se verifica la
// configuración que lo hace funcionar.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const pkgJson = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));

describe('Empaquetado con pkg', () => {
    test('las migraciones están declaradas como assets (si no, el .exe no corre ninguna migración)', () => {
        const assets = (pkgJson.pkg && pkgJson.pkg.assets) || [];
        expect(assets).toContain('db/migrations/**/*.js');
    });

    test('hay migraciones en disco que ese glob cubre', () => {
        const archivos = fs.readdirSync(path.join(RAIZ, 'db', 'migrations')).filter(f => f.endsWith('.js'));
        expect(archivos.length).toBeGreaterThan(0);
    });

    test('no hay otros require() dinámicos en el backend fuera de los ya cubiertos por assets', () => {
        // Un require() con argumento que no es un string literal no es
        // detectable por pkg: el archivo no se incluye en el .exe y falla
        // recién en producción. Si agregás uno, declaralo en pkg.assets (o
        // pkg.scripts) y sumalo a esta lista.
        const PERMITIDOS = new Set([path.join('db', 'migrator.js')]);
        const IGNORAR_DIRS = new Set(['node_modules', 'tests', 'dist', 'backups', 'firmas']);

        const encontrados = [];
        (function recorrer(dir) {
            for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entrada.isDirectory()) {
                    if (!IGNORAR_DIRS.has(entrada.name)) recorrer(path.join(dir, entrada.name));
                } else if (entrada.name.endsWith('.js') && !entrada.name.endsWith('.test.js')) {
                    const ruta = path.join(dir, entrada.name);
                    const relativa = path.relative(RAIZ, ruta);
                    const lineas = fs.readFileSync(ruta, 'utf8').split('\n');
                    lineas.forEach((linea, i) => {
                        const sinComentario = linea.replace(/\/\/.*$/, '');
                        if (/\brequire\(\s*(?!['"])/.test(sinComentario) && !PERMITIDOS.has(relativa)) {
                            encontrados.push(`${relativa}:${i + 1}: ${linea.trim()}`);
                        }
                    });
                }
            }
        })(RAIZ);

        expect(encontrados).toEqual([]);
    });
});
