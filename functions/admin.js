// functions/admin.js

import { getDataFromKV, saveDataToKV } from './lib/db.js';
import { escapeHtml, escapeJsStr, generateVideoId, jsonResponse, sha256 } from './lib/helpers.js';
import { renderAdminHtml } from './lib/render-videos.js';
import { authenticateAdmin } from './lib/auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '';
  const method = request.method.toUpperCase();

  // ---------- 优先处理密码登录（POST 且 Content-Type 为 JSON） ----------
  if (method === 'POST') {
    const contentType = request.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await request.clone().json();
        if (body.password) {
          return handlePasswordLogin(body.password, env);
        }
      } catch (e) {
        // 解析失败，继续后续处理
      }
    }
  }

  // ---------- 处理退出登录 ----------
  if (method === 'GET' && url.searchParams.get('logout') === '1') {
    return new Response(
      '已退出登录。 <a href="/admin">返回登录</a>',
      {
        status: 200,
        headers: {
          'Set-Cookie': 'admin_token=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0',
          'Content-Type': 'text/html; charset=UTF-8'
        }
      }
    );
  }

  // ---------- 验证管理员身份（除了密码登录、退出登录之外的请求） ----------
  const authError = await authenticateAdmin(context);
  if (authError) return authError;

  // ---------- 路由 ----------
  if (method === 'GET') {
    return handleGet(context, path);
  } else if (method === 'POST') {
    return handlePost(context, path);
  } else {
    return new Response('Method Not Allowed', { status: 405 });
  }
}

// ---------- 处理密码登录 ----------
async function handlePasswordLogin(password, env) {
  const adminPassword = env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return new Response('环境变量 ADMIN_PASSWORD 未设置', { status: 500 });
  }
  if (password === adminPassword) {
    const token = await sha256(adminPassword);
    return new Response('登录成功', {
      status: 200,
      headers: {
        'Set-Cookie': `admin_token=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=86400`,
        'Content-Type': 'text/plain'
      }
    });
  } else {
    return new Response('密码错误', { status: 401 });
  }
}

// ---------- GET 请求：渲染管理页面 ----------
async function handleGet(context, path) {
  const { env } = context;
  let data = await getDataFromKV(env);

  // 解析路径：user/xxx/platform/xxx/recycle
  const parts = path.split('/').filter(p => p);
  let userId = null;
  let platformId = null;
  let showRecycle = false;

  if (parts.length >= 2 && parts[0] === 'user') {
    userId = parts[1];
    if (parts.length >= 4 && parts[2] === 'platform') {
      platformId = parts[3];
      if (parts.length >= 5 && parts[4] === 'recycle') {
        showRecycle = true;
      }
    }
  }

  const html = renderAdminHtml(data, userId, platformId, showRecycle);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' }
  });
}

// ---------- POST 请求：处理所有 API 操作 ----------
async function handlePost(context, path) {
  const { request, env } = context;
  let data = await getDataFromKV(env);

  // 尝试解析 JSON 请求体（兼容 formData 则留空，但前端均使用 JSON）
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求体必须是有效的 JSON' }, 400);
  }

  const action = body.action;

  // 解析路径：user/xxx/platform/xxx
  const parts = path.split('/').filter(p => p);
  if (parts.length < 4 || parts[0] !== 'user' || parts[2] !== 'platform') {
    return jsonResponse({ error: '路径格式错误' }, 400);
  }
  const userId = parts[1];
  const platformId = parts[3];

  // 确保用户和平台存在
  if (!data.accounts[userId] || !data.accounts[userId].platforms[platformId]) {
    return jsonResponse({ error: '用户或平台不存在' }, 404);
  }

  const platform = data.accounts[userId].platforms[platformId];
  if (!platform.videos) platform.videos = {};

  try {
    switch (action) {

      // ---------- 添加视频 ----------
      case 'addVideo': {
        const title = (body.title || '').trim();
        const imageUrl = (body.imageUrl || '').trim();
        const affiliateLink = (body.affiliateLink || '').trim();
        if (!title || !imageUrl || !affiliateLink) {
          return jsonResponse({ error: '标题、图片链接和推广链接不能为空' }, 400);
        }

        // 自动生成 8 位哈希 ID
        const existingIds = new Set(Object.keys(platform.videos));
        const newId = await generateVideoId(title, existingIds);

        platform.videos[newId] = {
          id: newId,
          title,
          imageUrl,
          affiliateLink,
          deleted: false,
          deletedAt: null
        };

        await saveDataToKV(env, data);
        return jsonResponse({ success: true, id: newId, message: '视频已添加' });
      }

      // ---------- 软删除视频 ----------
      case 'deleteVideo': {
        const videoId = body.videoId;
        if (!videoId || !platform.videos[videoId]) {
          return jsonResponse({ error: '视频不存在' }, 404);
        }
        platform.videos[videoId].deleted = true;
        platform.videos[videoId].deletedAt = new Date().toISOString();
        await saveDataToKV(env, data);
        return jsonResponse({ success: true, message: '视频已移入回收站' });
      }

      // ---------- 恢复视频 ----------
      case 'restoreVideo': {
        const videoId = body.videoId;
        if (!videoId || !platform.videos[videoId]) {
          return jsonResponse({ error: '视频不存在' }, 404);
        }
        platform.videos[videoId].deleted = false;
        platform.videos[videoId].deletedAt = null;
        await saveDataToKV(env, data);
        return jsonResponse({ success: true, message: '视频已恢复' });
      }

      // ---------- 永久删除视频 ----------
      case 'permanentDeleteVideo': {
        const videoId = body.videoId;
        if (!videoId || !platform.videos[videoId]) {
          return jsonResponse({ error: '视频不存在' }, 404);
        }
        delete platform.videos[videoId];
        await saveDataToKV(env, data);
        return jsonResponse({ success: true, message: '视频已永久删除' });
      }

      // ---------- 更新视频（编辑） ----------
      case 'updateVideo': {
        const videoId = body.videoId;
        if (!videoId || !platform.videos[videoId]) {
          return jsonResponse({ error: '视频不存在' }, 404);
        }
        const title = (body.title || '').trim();
        const imageUrl = (body.imageUrl || '').trim();
        const affiliateLink = (body.affiliateLink || '').trim();
        if (!title || !imageUrl || !affiliateLink) {
          return jsonResponse({ error: '标题、图片链接和推广链接不能为空' }, 400);
        }
        platform.videos[videoId].title = title;
        platform.videos[videoId].imageUrl = imageUrl;
        platform.videos[videoId].affiliateLink = affiliateLink;
        await saveDataToKV(env, data);
        return jsonResponse({ success: true, message: '视频已更新' });
      }

      default:
        return jsonResponse({ error: '未知操作' }, 400);
    }
  } catch (err) {
    console.error('Admin POST 错误:', err);
    return jsonResponse({ error: '服务器错误: ' + err.message }, 500);
  }
}
