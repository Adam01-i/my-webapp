// backend-node/server.js
const mysql = require('mysql2/promise'); // promise version
const http = require('http');

let dbConnectionReady = false;

async function connectWithRetry() {
  while (!dbConnectionReady) {
    try {
      const connection = await mysql.createConnection({
        host: process.env.MYSQL_SERVICE_HOST || 'mysql-service',
        user: process.env.MYSQL_USER || 'webuser',
        password: process.env.MYSQL_PASSWORD || 'webpass_',
        database: process.env.MYSQL_DATABASE || 'webdb',
        port: 3306,
      });
      console.log("✅ Connected to MySQL");
      dbConnectionReady = true;
      connection.end();
    } catch (err) {
      console.log("⏳ MySQL not ready, retrying in 5s...");
      await new Promise(res => setTimeout(res, 5000));
    }
  }
}

connectWithRetry();

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health") {
    if (dbConnectionReady) {
      res.writeHead(200);
      res.end("OK");
    } else {
      res.writeHead(500);
      res.end("DB not ready");
    }
    return;
  }

  try {
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_SERVICE_HOST || 'mysql-service',
      user: process.env.MYSQL_USER || 'webuser',
      password: process.env.MYSQL_PASSWORD || 'webpass_',
      database: process.env.MYSQL_DATABASE || 'webdb',
      port: 3306,
    });
    const [rows] = await connection.execute('SELECT "Connexion Node.js -> MySQL OK" as message');
    connection.end();
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(rows[0]));
  } catch (err) {
    res.writeHead(500, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: err.message}));
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Node.js API on port ${port}`));