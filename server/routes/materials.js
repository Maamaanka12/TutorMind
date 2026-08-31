import { Router } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { getPool, sql } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { parseId, sanitizeString, rateLimit } from '../utils/validate.js';

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

// Generate a short descriptive title from content using Gemini
async function generateTitleFromContent(content, originalFilename) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `Read the following educational material and return ONLY a short, descriptive title (max 60 characters) that accurately reflects what the content is about. Do not use quotes or any extra text - just the title.\n\nOriginal filename: ${originalFilename}\n\nContent preview:\n${content.substring(0, 3000)}`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim().replace(/^"|"$/g, '');
}

// Preview: extract file content and generate title without saving
router.post('/preview', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const ext = req.file.originalname.split('.').pop().toLowerCase();
    let materialContent = '';

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

    if (!materialContent) {
      return res.status(400).json({ error: 'Could not extract text from this file' });
    }

    // Auto-generate title from content
    let title = '';
    try {
      title = await generateTitleFromContent(materialContent, req.file.originalname);
    } catch (aiErr) {
      console.error('AI title generation failed, using filename:', aiErr.message);
      title = req.file.originalname.replace(/\.[^.]+$/, '');
    }

    res.json({
      title,
      content: materialContent,
      filename: req.file.originalname,
    });
  } catch (err) {
    console.error('Preview error:', err);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// Upload material (text, PDF, DOCX, PPTX, or TXT)
router.post('/', authenticate, upload.single('file'), async (req, res) => {
  try {
    let { title, content } = req.body;
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

      // Auto-generate title from content if none provided
      if (!title && materialContent) {
        try {
          title = await generateTitleFromContent(materialContent, req.file.originalname);
        } catch (aiErr) {
          console.error('AI title generation failed, using filename:', aiErr.message);
          title = req.file.originalname.replace(/\.[^.]+$/, ''); // fallback to filename without extension
        }
      }
    }

    if (!materialContent) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Validate and sanitize content length
    if (materialContent.length > 500000) {
      return res.status(400).json({ error: 'Content too large. Maximum is 500,000 characters.' });
    }

    // Sanitize title
    const safeTitle = sanitizeString(title, 500);

    // If still no title, fallback to filename or generic
    if (!safeTitle) {
      title = req.file ? req.file.originalname.replace(/\.[^.]+$/, '') : 'Untitled Material';
    } else {
      title = safeTitle;
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
    const matId = parseId(req.params.id);
    if (!matId) return res.status(400).json({ error: 'Invalid material ID' });
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, matId)
      .input('studentId', sql.Int, req.userId)
      .query('SELECT * FROM Materials WHERE id = @id AND student_id = @studentId');

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const material = result.recordset[0];

    // Get associated concepts (verified by material ownership above)
    const concepts = await pool.request()
      .input('materialId', sql.Int, matId)
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
    const matId = parseId(req.params.id);
    if (!matId) return res.status(400).json({ error: 'Invalid material ID' });
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, matId)
      .input('studentId', sql.Int, req.userId)
      .query('DELETE FROM Materials WHERE id = @id AND student_id = @studentId');

    res.json({ message: 'Material deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
