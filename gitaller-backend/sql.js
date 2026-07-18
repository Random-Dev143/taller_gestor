const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./taller.db');

const sql = process.argv.slice(2).join(' ');

db.all(sql, [], (err, rows) => {
    if (err) {
        db.run(sql, function(err){
            if(err) console.error(err.message);
            else console.log("OK - Filas modificadas:", this.changes);
            db.close();
        });
    } else {
        console.table(rows);
        db.close();
    }
});