/* ============================================================
 *  幼儿园班级组合系统 — Render 后端（PostgreSQL 版）
 *  存储：PostgreSQL（Render 免费层无持久磁盘）
 * ============================================================ */
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL 连接池
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 解析 JSON body
app.use(express.json());

// CORS 允许 COS 前端跨域访问
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ========== 数据库初始化 ==========

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS choices (
        id SERIAL PRIMARY KEY,
        role VARCHAR(10) NOT NULL CHECK (role IN ('leader', 'teacher')),
        name VARCHAR(50) NOT NULL,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(role, name)
      );
    `);
    console.log('[数据库] 初始化完成');
  } finally {
    client.release();
  }
}

// ========== 健康检查 ==========
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ========== API 路由 ==========

// 获取所有数据
app.get('/api/data', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT role, name, data FROM choices ORDER BY role, name'
    );
    const data = { leaders: {}, teachers: {} };
    result.rows.forEach(row => {
      data[row.role === 'leader' ? 'leaders' : 'teachers'][row.name] = row.data;
    });
    res.json({ success: true, data });
  } catch (e) {
    console.error('[API] 获取数据失败:', e.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 获取班长选择
app.get('/api/leader/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const result = await pool.query(
      'SELECT data FROM choices WHERE role = $1 AND name = $2',
      ['leader', name]
    );
    const choice = result.rows.length > 0 ? result.rows[0].data : null;
    res.json({ success: true, name, choice });
  } catch (e) {
    console.error('[API] 获取班长数据失败:', e.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 保存班长选择
app.post('/api/leader/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const { selected } = req.body;

    if (!selected || !Array.isArray(selected) || selected.length !== 6) {
      return res.status(400).json({ success: false, error: '请选择恰好 6 位教师' });
    }

    const data = {
      selected,
      submitted: true,
      timestamp: new Date().toISOString()
    };

    await pool.query(
      `INSERT INTO choices (role, name, data, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (role, name) DO UPDATE SET data = $3, updated_at = NOW()`,
      ['leader', name, JSON.stringify(data)]
    );

    res.json({ success: true, message: '班长选择已保存' });
  } catch (e) {
    console.error('[API] 保存班长数据失败:', e.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 获取教师选择
app.get('/api/teacher/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const result = await pool.query(
      'SELECT data FROM choices WHERE role = $1 AND name = $2',
      ['teacher', name]
    );
    const choice = result.rows.length > 0 ? result.rows[0].data : null;
    res.json({ success: true, name, choice });
  } catch (e) {
    console.error('[API] 获取教师数据失败:', e.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 保存教师选择
app.post('/api/teacher/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const { leaders, teachers } = req.body;

    if (!leaders || !Array.isArray(leaders) || leaders.length !== 3) {
      return res.status(400).json({ success: false, error: '请选择恰好 3 位班长' });
    }
    if (!teachers || !Array.isArray(teachers) || teachers.length !== 3) {
      return res.status(400).json({ success: false, error: '请选择恰好 3 位组员教师' });
    }

    const data = {
      leaders,
      teachers,
      submitted: true,
      timestamp: new Date().toISOString()
    };

    await pool.query(
      `INSERT INTO choices (role, name, data, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (role, name) DO UPDATE SET data = $3, updated_at = NOW()`,
      ['teacher', name, JSON.stringify(data)]
    );

    res.json({ success: true, message: '教师选择已保存' });
  } catch (e) {
    console.error('[API] 保存教师数据失败:', e.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 清空所有数据（需要 key 验证）
app.post('/api/admin/clear', async (req, res) => {
  try {
    const { key } = req.body;
    if (key !== 'admin123') {
      return res.status(403).json({ success: false, error: '无权限' });
    }

    await pool.query('DELETE FROM choices');
    res.json({ success: true, message: '所有数据已清空' });
  } catch (e) {
    console.error('[API] 清空数据失败:', e.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ========== 启动服务器 ==========
async function start() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`\n🌸 幼儿园班级组合系统后端已启动（端口 ${PORT}）`);
      console.log(`   API: http://localhost:${PORT}/api/data\n`);
    });
  } catch (e) {
    console.error('启动失败:', e.message);
    process.exit(1);
  }
}

start();
