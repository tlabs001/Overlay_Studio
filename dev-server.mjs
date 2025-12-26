import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = process.env.PORT || 3000;
const baseDir = __dirname;

let memoryApiKey = process.env.OPENAI_API_KEY || null;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.wasm': 'application/wasm',
};

const sendJson = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const readRequestBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });

const buildKeypointSchema = () => {
  const pointSchema = {
    type: 'object',
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
      confidence: { type: 'number' },
    },
    required: ['x', 'y', 'confidence'],
    additionalProperties: false,
  };

  const keypoints = {
    type: 'object',
    properties: {
      left_eye: { anyOf: [{ type: 'null' }, pointSchema] },
      right_eye: { anyOf: [{ type: 'null' }, pointSchema] },
      nose_tip: { anyOf: [{ type: 'null' }, pointSchema] },
      mouth_left: { anyOf: [{ type: 'null' }, pointSchema] },
      mouth_right: { anyOf: [{ type: 'null' }, pointSchema] },
    },
    required: ['left_eye', 'right_eye', 'nose_tip', 'mouth_left', 'mouth_right'],
    additionalProperties: false,
  };

  const faceResult = {
    type: 'object',
    properties: {
      face_found: { type: 'boolean' },
      keypoints,
    },
    required: ['face_found', 'keypoints'],
    additionalProperties: false,
  };

  return {
    name: 'FaceKeypoints',
    schema: {
      type: 'object',
      properties: {
        reference: faceResult,
        drawing: faceResult,
      },
      required: ['reference', 'drawing'],
      additionalProperties: false,
    },
    strict: true,
  };
};

const fetchFaceKeypoints = async (referenceDataUrl, drawingDataUrl) => {
  if (!memoryApiKey) {
    throw new Error('API key missing');
  }

  const payload = {
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_schema', json_schema: buildKeypointSchema() },
    messages: [
      {
        role: 'system',
        content:
          'You are a face keypoint extractor. Choose the most prominent face (largest). Return normalized coordinates (0..1). If no face, face_found=false and all points null. Output MUST match schema.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract keypoints for REFERENCE image and DRAWING image.' },
          { type: 'image_url', image_url: { url: referenceDataUrl, detail: 'low' } },
          { type: 'image_url', image_url: { url: drawingDataUrl, detail: 'low' } },
        ],
      },
    ],
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${memoryApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  if (typeof content === 'string') {
    return JSON.parse(content);
  }
  return content;
};

const serveStatic = (urlPath, res) => {
  const cleanPath = path.normalize(urlPath).replace(/^\/+/, '');
  const relativePath = cleanPath === '' ? 'index.html' : cleanPath;
  const resolvedPath = path.join(baseDir, relativePath);

  if (!resolvedPath.startsWith(baseDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const exists = fs.existsSync(resolvedPath);
  const filePath = exists ? resolvedPath : path.join(baseDir, 'index.html');
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Server error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/status' && req.method === 'GET') {
    sendJson(res, 200, { hasKey: Boolean(memoryApiKey) });
    return;
  }

  if (url.pathname === '/api/key' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      memoryApiKey = body?.apiKey?.trim() || null;
      sendJson(res, 200, { ok: true });
    } catch (error) {
      console.error('Failed to save key', error);
      sendJson(res, 400, { error: 'Invalid key payload' });
    }
    return;
  }

  if (url.pathname === '/api/face-keypoints' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const { referenceDataUrl, drawingDataUrl } = body || {};
      if (!referenceDataUrl || !drawingDataUrl) {
        sendJson(res, 400, { error: 'Missing images' });
        return;
      }
      const result = await fetchFaceKeypoints(referenceDataUrl, drawingDataUrl);
      sendJson(res, 200, result);
    } catch (error) {
      console.error('Face keypoint proxy failed', error);
      sendJson(res, 500, { error: error.message || 'Proxy error' });
    }
    return;
  }

  serveStatic(url.pathname, res);
});

server.listen(port, () => {
  console.log(`Overlay Studio dev server running at http://localhost:${port}`);
  if (memoryApiKey) {
    console.log('OpenAI API key loaded from environment.');
  }
});
