import { Router } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { getPool, sql } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['pdf', 'docx', 'pptx', 'txt'];
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type ".${ext}". Please upload a PDF, DOCX, PPTX, or TXT file.`));
    }
  },
});

// Extract text from PPTX buffer using JSZip
async function extractPptxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  slideFiles.sort();
  const texts = [];
  for (const file of slideFiles) {
    const xml = await zip.file(file).async('string');
    const slideTexts = [];
    const regex = /<a:t[^>]*>([^<]*)<\/a:t>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      if (match[1].trim()) slideTexts.push(match[1].trim());
    }
    if (slideTexts.length > 0) texts.push(slideTexts.join(' '));
  }
  return texts.join('\n\n');
}

// Upload material (text, PDF, DOCX, PPTX, or TXT)
router.post('/', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { title, content } = req.body;
    let materialContent = content;

    // If a file was uploaded
    if (req.file) {
      const ext = req.file.originalname.split('.').pop().toLowerCase();

      if (ext === 'pdf') {
        const data = await pdfParse(req.file.buffer);
        materialContent = data.text;
      } else if (ext === 'docx') {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        materialContent = result.value;
      } else if (ext === 'pptx') {
        materialContent = await extractPptxText(req.file.buffer);
      } else if (ext === 'txt') {
        materialContent = req.file.buffer.toString('utf-8');
      }
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
    if (err.message && err.message.includes('Unsupported file type')) {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File is too large. Maximum size is 10 MB.' });
    }
    if (err.message && (err.message.includes('Invalid') || err.message.includes('corrupt') || err.message.includes('password'))) {
      return res.status(400).json({ error: 'Unable to read this file. It may be corrupted or password-protected. Please try a different file.' });
    }
    res.status(500).json({ error: 'Something went wrong while processing your file. Please try again.' });
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
