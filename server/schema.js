import { getPool, sql } from './db.js';

async function verifyDatabase() {
  const pool = await getPool();

  const tables = ['Students', 'Materials', 'Concepts', 'Questions', 'Answers', 'KnowledgeProfile', 'LearningSessions', 'Flashcards', 'FlashcardProgress'];

  for (const table of tables) {
    const result = await pool.request()
      .query(`SELECT COUNT(*) as count FROM sysobjects WHERE name='${table}' AND xtype='U'`);

    if (result.recordset[0].count === 0) {
      throw new Error(`Table "${table}" not found. Please run init.sql first.`);
    }
  }

  console.log('All database tables verified');
}

export default verifyDatabase;
