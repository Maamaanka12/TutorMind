import { Router } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { getPool, sql } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Upload material (text or PDF)
router.post('/', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { title, content } = req.body;
    let materialContent = content;

    // If a PDF was uploaded
    if (req.file) {
      const data = await pdfParse(req.file.buffer);
      materialContent = data.text;
    }

    if (!title || !materialContent) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('studentId', sql.Int, req.userId)
      .input('title', sql.NVarChar, title)
      .input('content', sql.NVarChar, materialContent)
      .query('INSERT INTO Materials (student_id, title, content) OUTPUT INSERTED.id, INSERTED.created_at VALUES (@studentId, @title, @content)');

    const material = result.recordset[0];

    res.json({
      id: material.id,
      title,
      created_at: material.created_at,
      message: 'Material uploaded. AI will analyze it shortly.'
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all materials for a student
router.get('/', authenticate, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('studentId', sql.Int, req.userId)
      .query('SELECT id, title, created_at FROM Materials WHERE student_id = @studentId ORDER BY created_at DESC');

    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get material details with concepts
router.get('/:id', authenticate, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('studentId', sql.Int, req.userId)
      .query('SELECT * FROM Materials WHERE id = @id AND student_id = @studentId');

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const material = result.recordset[0];

    // Get associated concepts
    const concepts = await pool.request()
      .input('materialId', sql.Int, req.params.id)
      .query('SELECT * FROM Concepts WHERE material_id = @materialId');

    material.concepts = concepts.recordset;
    res.json(material);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete material
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('studentId', sql.Int, req.userId)
      .query('DELETE FROM Materials WHERE id = @id AND student_id = @studentId');

    res.json({ message: 'Material deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
