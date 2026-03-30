const mysql = require('mysql2');
const http = require('http');
const connection = mysql.createConnection({
    host: process.env.MYSQL_SERVICE_HOST || 'mysql-service',
    user: process.env.MYSQL_USER || 'webuser',
    password: process.env.MYSQL_PASSWORD || 'webpass_',
    database: process.env.MYSQL_DATABASE || 'webdb',
    port: 3306
});
const server = http.createServer((req, res) => {
    connection.connect(err => {
        if (err) {
            res.writeHead(500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: 'Erreur connexion DB'}));
            return;
        }
        connection.query('SELECT "Connexion Node.js -> MySQL OK" as message', (err, results) => {
            if (err) {
                res.writeHead(500);
                res.end(JSON.stringify({error: err.message}));
                return;
            }
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(results[0]));
        });
    });
});
const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Node.js API on port ${port}`));