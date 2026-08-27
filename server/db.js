import sql from 'mssql';
import 'dotenv/config';

const config = {
  server: process.env.DB_SERVER || 'localhost\\SQLEXPRESS',
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_DATABASE || 'AdaptiveLearning',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
  },
};

let pool = null;

export async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
  }
  return pool;
}

export { sql };
