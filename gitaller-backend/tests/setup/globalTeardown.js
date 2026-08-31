'use strict';
const fs = require('fs');
const { STATE_FILE } = require('./globalSetup');

module.exports = async function globalTeardown() {
    if (!fs.existsSync(STATE_FILE)) return;

    const { pid, tmpAppData } = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

    try {
        process.kill(pid);
    } catch (_) {
        // ya estaba muerto, no pasa nada
    }

    try {
        fs.rmSync(tmpAppData, { recursive: true, force: true });
    } catch (_) { /* best-effort */ }

    try {
        fs.rmSync(STATE_FILE, { force: true });
    } catch (_) { /* best-effort */ }
};
