import os
import pymysql
from flask import Flask, jsonify

app = Flask(__name__)

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