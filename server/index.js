import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import initializeDatabase from './schema.js';
import authRoutes from './routes/auth.js';
import materialsRoutes from './routes/materials.js';
import aiRoutes from './routes/ai.js';
import flashcardsRoutes from './routes/flashcards.js';
import examsRoutes from './routes/exams.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/flashcards', flashcardsRoutes);
app.use('/api/exams', examsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler (catches multer and other middleware errors)
app.use((err, _req, res, _next) => {
  if (err.message && err.message.includes('Unsupported file type')) {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File is too large. Maximum size is 10 MB.' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// Initialize database and start server
async function start() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
