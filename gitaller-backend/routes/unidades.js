const express = require('express');
const router = express.Router();
const { run, all, get, withTransaction } = require('../config/database');
const { limpiarCuit } = require('../modules/importacion/normalizacion');

// Chasis: se guarda en mayúsculas y sin espacios. "X111111" es el valor que usa la
// planilla de NPS para "no se conoce", así que se guarda vacío.
const normalizarChasis = (v) => {
    const c = String(v == null ? '' : v).toUpperCase().replace(/\s+/g, '');
    return c === 'X111111' ? '' : c;
};
// undefined = no se envió (no se toca); '' = borrar; otro valor = debe ser un CUIT válido.
const validarCuit = (v) => {
    if (v === undefined) return undefined;
    if (String(v).trim() === '') return '';
    const c = limpiarCuit(v);
    if (!c) { const e = new Error('El CUIT no es válido (deben ser 11 dígitos).'); e.status = 400; throw e; }
    return c;
};

router.get('/clientes/buscar', async (req, res) => {
    const q = `%${(req.query.q || '').toUpperCase()}%`;
    const clientes = await all(`SELECT id, nombre, telefono, correo FROM clientes WHERE nombre LIKE ? LIMIT 8`, [q]);
    res.json(clientes);
});

// Vehículos ya registrados para un cliente. Se usa en NuevaOT.vue para
// sugerir la unidad al elegir el cliente del autocompletado, en vez de
// tener que tipear la patente de nuevo si ya la conocemos.
router.get('/cliente/:clienteId', async (req, res) => {
    const unidades = await all(
        `SELECT u.patente, u.unidad,
                (SELECT o.kilometraje FROM ordenes o WHERE o.patente = u.patente ORDER BY CAST(o.ot AS INTEGER) DESC LIMIT 1) AS ultimo_kilometraje
         FROM unidades u WHERE u.cliente_id = ? ORDER BY u.id DESC`,
        [req.params.clienteId]
    );
    res.json(unidades);
});

router.get('/', async (req, res) => {
    res.json(await all(`SELECT u.*, c.nombre AS cliente, c.cuit AS cliente_cuit FROM unidades u JOIN clientes c ON u.cliente_id = c.id ORDER BY u.id DESC`));
});

router.get('/:patente', async (req, res) => {
    const unidad = await get(`SELECT u.*, c.nombre AS cliente, c.cuit AS cliente_cuit FROM unidades u JOIN clientes c ON u.cliente_id = c.id WHERE u.patente = ?`, [req.params.patente]);
    if (!unidad) return res.status(404).json({ error: 'Unidad no encontrada' });
    res.json(unidad);
});

router.post('/', async (req, res) => {
    const { patente, cliente, unidad, telefono, correo, contacto_nombre, contacto_apellido, chasis, cuit } = req.body;
    if (!patente || !cliente || !unidad) return res.status(400).json({ error: 'Faltan datos' });
    const cuitNuevo = validarCuit(cuit);

    await withTransaction(async () => {
        let cli = await get(`SELECT id FROM clientes WHERE nombre = ?`, [cliente.toUpperCase()]);
        if (!cli) {
            await run(`INSERT INTO clientes (nombre) VALUES (?)`, [cliente.toUpperCase()]);
            cli = await get(`SELECT id FROM clientes WHERE nombre = ?`, [cliente.toUpperCase()]);
        }
        if (cuitNuevo) await run(`UPDATE clientes SET cuit = ? WHERE id = ?`, [cuitNuevo, cli.id]);
        await run(`INSERT INTO unidades (patente, cliente_id, unidad, telefono, correo, contacto_nombre, contacto_apellido, chasis) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [patente, cli.id, unidad, telefono || '', correo || '', contacto_nombre || '', contacto_apellido || '', normalizarChasis(chasis)]);
    });
    res.json({ status: 'Unidad creada' });
});

// Edición de una unidad (corregir errores de tipeo en patente, cliente, unidad o contacto).
//
// - La patente SÍ se puede corregir. ordenes.patente referencia unidades.patente con
//   ON UPDATE CASCADE, así que el cambio se propaga solo a todas las OT de la unidad.
// - Si la patente nueva ya pertenece a OTRA unidad, se rechaza (no se fusionan unidades).
// - Si la patente que llega es igual a la guardada, no se toca ni se "normaliza": hay
//   datos viejos con formato distinto y no queremos disparar un renombre sin que nadie lo pida.
router.put('/:id', async (req, res) => {
    const fallo = (status, mensaje) => { const e = new Error(mensaje); e.status = status; return e; };
    const texto = (v) => (v === undefined || v === null ? '' : String(v).trim());
    const { telefono, correo, contacto_nombre, contacto_apellido, chasis, cuit } = req.body;
    const cuitNuevo = validarCuit(cuit); // undefined = no se envió; '' = borrar; inválido = 400
    const cliente = texto(req.body.cliente).toUpperCase();
    const unidad = texto(req.body.unidad);

    const actual = await get(`SELECT * FROM unidades WHERE id = ?`, [req.params.id]);
    if (!actual) throw fallo(404, 'Unidad no encontrada');
    if (!cliente) throw fallo(400, 'Indicá el cliente.');
    if (!unidad) throw fallo(400, 'Indicá la unidad (marca/modelo).');

    let patenteNueva = actual.patente;
    const patenteRecibida = texto(req.body.patente);
    if (patenteRecibida && patenteRecibida !== actual.patente) {
        patenteNueva = patenteRecibida.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (patenteNueva.length < 3) throw fallo(400, 'La patente es demasiado corta o tiene caracteres inválidos.');
        if (actual.patente === 'INT000') throw fallo(400, 'La unidad interna del sistema (INT000) no puede cambiar de patente.');
        if (patenteNueva !== actual.patente) {
            const duplicada = await get(
                `SELECT u.patente, c.nombre AS cliente FROM unidades u JOIN clientes c ON u.cliente_id = c.id WHERE u.patente = ? AND u.id != ?`,
                [patenteNueva, req.params.id]
            );
            if (duplicada) throw fallo(409, `Ya existe una unidad con la patente ${patenteNueva} (cliente ${duplicada.cliente}). No se puede repetir.`);
        }
    }

    await withTransaction(async () => {
        let cli = await get(`SELECT id FROM clientes WHERE nombre = ?`, [cliente]);
        if (!cli) {
            await run(`INSERT INTO clientes (nombre) VALUES (?)`, [cliente]);
            cli = await get(`SELECT id FROM clientes WHERE nombre = ?`, [cliente]);
        }
        if (cuitNuevo !== undefined) await run(`UPDATE clientes SET cuit = ? WHERE id = ?`, [cuitNuevo, cli.id]);
        await run(`UPDATE unidades SET patente = ?, cliente_id = ?, unidad = ?, telefono = ?, correo = ?, contacto_nombre = ?, contacto_apellido = ?, chasis = COALESCE(?, chasis) WHERE id = ?`,
            [patenteNueva, cli.id, unidad, telefono || '', correo || '', contacto_nombre || '', contacto_apellido || '', chasis === undefined ? null : normalizarChasis(chasis), req.params.id]);
    });

    const { n } = await get(`SELECT COUNT(*) AS n FROM ordenes WHERE patente = ?`, [patenteNueva]);
    res.json({ status: 'Unidad actualizada', patente: patenteNueva, patente_cambiada: patenteNueva !== actual.patente, ordenes_de_la_unidad: n });
});

router.delete('/:id', async (req, res) => {
    // Este catch NO es boilerplate: traduce un error técnico de SQLite en un
    // mensaje entendible para el usuario, así que se mantiene. La diferencia
    // con el código anterior es que ya no arma la respuesta HTTP a mano acá
    // para el caso genérico — si no es el error de FK esperado, se relanza
    // (`throw error`) y el middleware global se encarga del 500.
    try {
        await run(`DELETE FROM unidades WHERE id = ?`, [req.params.id]);
        res.json({ status: 'Unidad eliminada' });
    } catch (error) {
        if (error.message.includes('FOREIGN KEY constraint failed')) {
            const e = new Error('No se puede eliminar la unidad porque tiene OTs asociadas. Elimine primero el historial de taller.');
            e.status = 400;
            throw e;
        }
        throw error;
    }
});

module.exports = router;
