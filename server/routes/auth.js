import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPool, sql } from '../db.js';
import 'dotenv/config';

const router = Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const pool = await getPool();

    // Check if email exists
    const existing = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT id FROM Students WHERE email = @email');

    if (existing.recordset.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, email)
      .input('passwordHash', sql.NVarChar, passwordHash)
      .query('INSERT INTO Students (name, email, password_hash) OUTPUT INSERTED.id VALUES (@name, @email, @passwordHash)');

    const userId = result.recordset[0].id;

    const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: userId, name, email } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const pool = await getPool();

    const result = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT id, name, email, password_hash FROM Students WHERE email = @email');

    if (result.recordset.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.recordset[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, decoded.userId)
      .query('SELECT id, name, email FROM Students WHERE id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.recordset[0] });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
