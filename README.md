
---

# 📄 RAPPORT COMPLET — DÉPLOIEMENT D'UNE APPLICATION WEB SUR OPENSHIFT AVEC CI/CD

## 🎯 Contexte et objectifs

Dans le cadre d'un projet pratique, l'objectif était de déployer une application web complète sur un **cluster OpenShift en mode sandbox**, avec les contraintes suivantes :

* Utilisation de **deux machines virtuelles (KubeVirt)** initialement, puis abandon de celles-ci au profit de pods classiques pour des raisons de stabilité
* Mise en place d'une **base de données MySQL persistante**
* Développement de **deux API** (Node.js et Python) communiquant avec MySQL
* Création d'un **frontend statique** (HTML/CSS/JS) pour afficher un tableau de bord interrogeant les deux API
* Mise en place d'une **intégration continue / déploiement continu (CI/CD)** via **GitHub Actions** : à chaque `git push`, les applications sont automatiquement reconstruites et redéployées sur OpenShift

Ce rapport détaille l'ensemble des actions menées, des problèmes rencontrés et des solutions adoptées, en s'appuyant sur l'historique complet de la session de travail.

---

## 🏗️ Architecture finale

| Composant       | Technologie                           | Accès                                     | Persistance           |
| --------------- | ------------------------------------- | ----------------------------------------- | --------------------- |
| Base de données | MySQL 8                               | Service interne `mysql-service:3306`      | PVC `mysql-pvc` (5Gi) |
| API Node.js     | Node.js 22 + `mysql2`                 | Route HTTP `node-route` (port 3000)       | —                     |
| API Python      | Flask + `pymysql` + `flask_cors`      | Route HTTP `python-route` (port 8080)     | —                     |
| Frontend        | Nginx (`nginxinc/nginx-unprivileged`) | Route HTTP `web-frontend-route` (port 80) | —                     |
| CI/CD           | GitHub Actions                        | Workflow sur push `main`                  | —                     |

### 🔗 Schéma des communications

![Schéma](media/image3.png)

---

## 🔐 NetworkPolicies mises en place

* `allow-all-internal` : autorise toutes les communications entre pods du même namespace
* `allow-from-openshift-ingress` : autorise le trafic entrant depuis le namespace du routeur OpenShift (non fonctionnel en sandbox, mais conservée)
* `allow-all-ingress` : autorise tout trafic entrant (utilisée pour les tests)

---

### 2. 🗄️ Déploiement de MySQL avec persistance

#### 📦 PersistentVolumeClaim

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mysql-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
```

#### 🚀 Déploiement MySQL

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mysql
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
        - name: mysql
          image: mysql:8
          env:
            - name: MYSQL_ROOT_PASSWORD
              value: rootpass
            - name: MYSQL_DATABASE
              value: webdb
            - name: MYSQL_USER
              value: webuser
            - name: MYSQL_PASSWORD
              value: webpass_
          ports:
            - containerPort: 3306
          volumeMounts:
            - name: mysql-storage
              mountPath: /var/lib/mysql
      volumes:
        - name: mysql-storage
          persistentVolumeClaim:
            claimName: mysql-pvc
```

#### 🔌 Service MySQL

```bash
oc expose deployment mysql --name=mysql-service --port=3306
```

---

### 3. 🧩 Création des ConfigMaps

#### 🟢 Node.js (`server.js`)

```javascript
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
```

---

#### 🐍 Python (`Flask`)

```python
# backend-python/app.py
import os
import pymysql
from flask import Flask, jsonify
from flask_cors import CORS  

app = Flask(__name__)
CORS(app)

def get_db_connection():
    return pymysql.connect(
        host=os.environ.get('MYSQL_SERVICE_HOST', 'mysql-service'),
        user=os.environ.get('MYSQL_USER', 'webuser'),
        password=os.environ.get('MYSQL_PASSWORD', 'webpass_'),
        database=os.environ.get('MYSQL_DATABASE', 'webdb'),
        port=3306,
        cursorclass=pymysql.cursors.DictCursor
    )

@app.route('/')
def index():
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT 'Connexion Python -> MySQL OK' as message")
            result = cursor.fetchone()
        conn.close()
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)

@app.route('/health')
def health():
    try:
        conn = get_db_connection()
        conn.close()
        return "OK", 200
    except:
        return "DB not ready", 500
```

---

### 4. 🚀 Déploiement des APIs et du frontend

#### Node.js

```bash
oc new-app https://github.com/Adam01-i/my-webapp --context-dir=backend-node --name=node-api
oc expose svc node-api --name=node-route
```

#### Python

```bash
oc new-app https://github.com/Adam01-i/my-webapp --context-dir=backend-python --name=python-api
oc expose svc python-api --name=python-route
```

#### Frontend

```bash
oc create configmap frontend-files \
  --from-file=index.html \
  --from-file=style.css \
  --from-file=script.js
```
![Schéma](media/image4.png)

---

### 5. 🌐 Résolution des problèmes réseau

#### a) NetworkPolicy interne : allow-all-internal

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-all-internal
spec:
  podSelector: {}
  ingress:
    - from:
        - podSelector: {}
  policyTypes:
    - Ingress
```

---

#### b) NetworkPolicy interne : allow-from-openshift-ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
 name: allow-from-openshift-ingress
spec:
 ingress:
 - from:
 - namespaceSelector:
 matchLabels:
 kubernetes.io/metadata.name: openshift-ingress
 podSelector: {}
 policyTypes:
 - Ingress
```

---


### 6. 🔄 CI/CD avec GitHub Actions

#### 🔐 Création du service account

```bash
oc create sa github-actions -n adam01-i-dev
oc policy add-role-to-user edit -z github-actions -n adam01-i-dev
oc create token github-actions --duration=8760h -n adam01-i-dev
```
![Schéma](media/image5.png)


#### ⚙️ Workflow

```yaml
name: Deploy to OpenShift

on:
  push:
    branches: [ main, master ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install OpenShift CLI
        uses: redhat-actions/openshift-tools-installer@v1
        with:
          oc: latest

      - name: Login OpenShift
        run: |
          oc login --token=${{ secrets.OPENSHIFT_TOKEN }} --server=${{ secrets.OPENSHIFT_SERVER }}

      - name: Build Node.js
        run: oc start-build node-api --follow -n ${{ secrets.OPENSHIFT_NAMESPACE }}

      - name: Build Python
        run: oc start-build python-api --follow -n ${{ secrets.OPENSHIFT_NAMESPACE }}

      - name: Build Frontend
        run: oc start-build web-frontend --follow -n ${{ secrets.OPENSHIFT_NAMESPACE }}

      - name: Update Deployments
        run: |
          oc set image deploy/node-api node-api=image-registry.openshift-image-registry.svc:5000/${{ secrets.OPENSHIFT_NAMESPACE }}/node-api:latest
          oc set image deploy/python-api python-api=image-registry.openshift-image-registry.svc:5000/${{ secrets.OPENSHIFT_NAMESPACE }}/python-api:latest
          oc set image deploy/web-frontend nginx=image-registry.openshift-image-registry.svc:5000/${{ secrets.OPENSHIFT_NAMESPACE }}/web-frontend:latest
          oc rollout restart deploy/node-api
          oc rollout restart deploy/python-api
          oc rollout restart deploy/web-frontend
```

#### ⚙️ Resultats des builds
![Schéma](media/image6.png)

---

## ⚠️ Problèmes rencontrés et solutions

| Problème                | Solution                     |
| ----------------------- | ---------------------------- |
| VMs KubeVirt instables  | Passage aux pods             |
| Pod PHP non fonctionnel | Remplacement par Flask       |
| Nginx non-root          | `nginx-unprivileged`         |
| MySQL inaccessible      | NetworkPolicy                |
| Routes en 503           | Correction services + policy |
| CORS bloqué             | Ajout headers                |
| Webhooks GitHub 403     | GitHub Actions               |

---

## ✅ État final fonctionnel

* **Node.js** :
  [http://node-route-adam01-i-dev.apps.rm3.7wse.p1.openshiftapps.com](http://node-route-adam01-i-dev.apps.rm3.7wse.p1.openshiftapps.com)

* **Python** :
  [http://python-route-adam01-i-dev.apps.rm3.7wse.p1.openshiftapps.com](http://python-route-adam01-i-dev.apps.rm3.7wse.p1.openshiftapps.com)

* **Frontend** :
  [http://web-frontend-route-adam01-i-dev.apps.rm3.7wse.p1.openshiftapps.com](http://web-frontend-route-adam01-i-dev.apps.rm3.7wse.p1.openshiftapps.com)

![Schéma](media/image7.png)

---

## 🧪 Tests

### Commandes test des routes api ainsi que le frontend
```bash
curl http://node-route-adam01-i-dev.apps.rm3.7wse.p1.openshiftapps.com
curl http://python-route-adam01-i-dev.apps.rm3.7wse.p1.openshiftapps.com
curl http://web-frontend-route-adam01-i-dev.apps.rm3.7wse.p1.openshiftapps.com/
```

### Resultats des tests
![Schéma](media/image8.png)


---

## 📎 Conclusion

Le projet a atteint tous ses objectifs :

* Application web complète et fonctionnelle
* Base de données persistante
* APIs Node.js et Python opérationnelles
* Frontend dynamique
* CI/CD automatisé
* Résolution des problèmes techniques majeurs

---

## 🔗 Liens

* GitHub : [https://github.com/Adam01-i/my-webapp](https://github.com/Adam01-i/my-webapp)
* Application : [http://web-frontend-route-adam01-i-dev.apps.rm3.7wse.p1.openshiftapps.com](http://web-frontend-route-adam01-i-dev.apps.rm3.7wse.p1.openshiftapps.com)

---