const mysql = require('mysql2');
const http = require('http');

const pool = mysql.createPool({
    host: process.env.MYSQL_SERVICE_HOST || 'mysql-service',
    user: process.env.MYSQL_USER || 'webuser',
    password: process.env.MYSQL_PASSWORD || 'webpass_',
    database: process.env.MYSQL_DATABASE || 'webdb',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
});

const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    pool.query('SELECT "Connexion Node.js -> MySQL OK" as message', (err, results) => {
        if (err) {
            res.writeHead(500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: err.message}));
            return;
        }

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(results[0]));
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Node.js API on port ${port}`));