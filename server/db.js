import 'dotenv/config';

let sql;

const hasUser = process.env.DB_USER && process.env.DB_USER.trim().length > 0;

if (hasUser) {
  // SQL Server Authentication - use default tedious driver
  const mssql = await import('mssql');
  sql = mssql.default;
} else {
  // Windows Authentication - use msnodesqlv8 driver
  const mssql = await import('mssql/msnodesqlv8.js');
  sql = mssql.default;
}

const server = process.env.DB_SERVER || 'localhost\\SQLEXPRESS';
const port = process.env.DB_PORT || '1433';
const database = process.env.DB_DATABASE || 'AdaptiveLearning';

let pool = null;

export async function getPool() {
  if (!pool) {
    if (hasUser) {
      // SQL Server Authentication
      pool = await sql.connect({
        server,
        port: parseInt(port),
        database,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        options: {
          trustServerCertificate: true,
        },
      });
    } else {
      // Windows Authentication via msnodesqlv8 with explicit connection string
      const connectionString = `Driver={ODBC Driver 17 for SQL Server};Server=${server};Database=${database};Trusted_Connection=Yes;TrustServerCertificate=Yes;`;
      pool = await sql.connect({ connectionString });
    }
  }
  return pool;
}

export { sql };
