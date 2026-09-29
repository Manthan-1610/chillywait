import { createServer } from 'node:http';
import { MongoClient } from 'mongodb';

const PORT = Number(process.env.LEADERBOARD_PORT || 8787);
const HOST = '127.0.0.1';
const USERNAME_RE = /^[a-z0-9_]{3,16}$/;
const GAMES = new Set(['traffic', 'coffee', 'compile-run']);
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

const uri = process.env.MONGODB_URI?.trim();
if (!uri || uri.includes('<db_password>') || uri.includes('YOUR_PASSWORD')) {
  console.error('Set MONGODB_URI in .env before starting the leaderboard API.');
  process.exit(1);
}

const client = new MongoClient(uri);
const db = client.db('chillywait');
const profiles = db.collection('player_profiles');
const scores = db.collection('leaderboard_scores');

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

async function checkUsername(body) {
  const username = String(body.username ?? '').trim().toLowerCase();
  const playerId = String(body.playerId ?? '');
  if (!USERNAME_RE.test(username)) return { available: false };
  const owner = await profiles.findOne({ username });
  if (!owner) return { available: true };
  return { available: playerId.length > 0 && owner.playerId === playerId };
}

async function claimUsername(body) {
  const username = String(body.username ?? '').trim().toLowerCase();
  const playerId = String(body.playerId ?? '');
  if (!USERNAME_RE.test(username) || !playerId) {
    return { ok: false, error: 'invalid_format' };
  }

  const existing = await profiles.findOne({ playerId });
  const now = new Date();

  if (!existing) {
    const taken = await profiles.findOne({ username });
    if (taken) return { ok: false, error: 'taken' };
    await profiles.insertOne({ playerId, username, usernameSetAt: now });
    return { ok: true, username, username_set_at: now.toISOString() };
  }

  if (existing.username === username) {
    return {
      ok: true,
      username,
      username_set_at: new Date(existing.usernameSetAt).toISOString(),
    };
  }

  const setAt = new Date(existing.usernameSetAt).getTime();
  const eligibleAt = setAt + COOLDOWN_MS;
  if (Date.now() < eligibleAt) {
    return {
      ok: false,
      error: 'cooldown',
      eligible_at: new Date(eligibleAt).toISOString(),
    };
  }

  const taken = await profiles.findOne({ username, playerId: { $ne: playerId } });
  if (taken) return { ok: false, error: 'taken' };

  await profiles.updateOne({ playerId }, { $set: { username, usernameSetAt: now } });
  await scores.updateMany({ playerId }, { $set: { username } });
  return { ok: true, username, username_set_at: now.toISOString() };
}

async function fetchBoard(game) {
  if (!GAMES.has(game)) return { ok: false, error: 'invalid game' };
  const rows = await scores
    .find({ gameId: game })
    .sort({ score: -1, updatedAt: 1 })
    .limit(25)
    .toArray();
  return {
    ok: true,
    entries: rows.map((row, index) => ({
      rank: index + 1,
      player_id: row.playerId,
      username: row.username,
      score: row.score,
      updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
    })),
  };
}

async function submitScore(body) {
  const game = String(body.game ?? '');
  const playerId = String(body.playerId ?? '');
  const score = Math.floor(Number(body.score));
  if (!GAMES.has(game) || !playerId) return { ok: false, error: 'invalid game' };
  if (!Number.isFinite(score) || score < 1 || score > 9_999_999) {
    return { ok: false, error: 'invalid score' };
  }

  const profile = await profiles.findOne({ playerId });
  if (!profile) return { ok: false, error: 'username required' };

  await scores.updateOne(
    { playerId, gameId: game },
    {
      $max: { score },
      $set: { username: profile.username, updatedAt: new Date() },
      $setOnInsert: { playerId, gameId: game },
    },
    { upsert: true },
  );
  return { ok: true, submitted: true };
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }

  const url = new URL(req.url ?? '/', `http://${HOST}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { ok: true });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/v1/leaderboard') {
      json(res, 200, await fetchBoard(url.searchParams.get('game') ?? ''));
      return;
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      if (body == null) {
        json(res, 400, { ok: false, error: 'invalid json' });
        return;
      }
      if (url.pathname === '/v1/username/check') {
        json(res, 200, await checkUsername(body));
        return;
      }
      if (url.pathname === '/v1/username/claim') {
        json(res, 200, await claimUsername(body));
        return;
      }
      if (url.pathname === '/v1/score') {
        json(res, 200, await submitScore(body));
        return;
      }
    }

    json(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    console.error('request failed', err instanceof Error ? err.name : 'error');
    json(res, 500, { ok: false, error: 'server error' });
  }
});

try {
  await client.connect();
  await profiles.createIndex({ username: 1 }, { unique: true });
  await profiles.createIndex({ playerId: 1 }, { unique: true });
  await scores.createIndex({ playerId: 1, gameId: 1 }, { unique: true });
  await scores.createIndex({ gameId: 1, score: -1 });
} catch (err) {
  const code = err && typeof err === 'object' && 'codeName' in err ? err.codeName : 'connect_failed';
  console.error('MongoDB connection failed:', code);
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  console.log(`Leaderboard API listening on http://${HOST}:${PORT}`);
});
