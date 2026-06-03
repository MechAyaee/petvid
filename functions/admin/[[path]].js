// functions/admin/[[path]].js

import { getDataFromKV, saveDataToKV } from '../lib/db.js';
import { escapeHtml, escapeJsStr, generateVideoId, jsonResponse, sha256 } from '../lib/helpers.js';
import { renderAdminHtml } from '../lib/render-admin.js';
import { authenticateAdmin } from '../lib/auth.js';

export async function onRequest(context) {
  const { request, params, env } = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // /admin               → params.path = [] 或 undefined
  // /admin/zhangsan      → params.path = ['zhangsan']
  // /admin/zhangsan/tube → params.path = ['zhangsan', 'tube']
  const pathParts = params.path || [];

  // ---------- 优先处理密码登录（POST 且 Content-Type 为 JSON） ----------
  if (method === 'POST') {
    const contentType = request.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await request.clone().json();
        if (body.password) {
          return handlePasswordLogin(body.password, env);
        }
      } catch (e) { /* 解析失败，继续后续处理 */ }
    }
  }

  // ---------- 处理退出登录 ----------
  if (method === 'GET' && url.searchParams.get('logout') === '1') {
    return new Response(
      '已退出登录。 <a href="/admin">返回登录</a>',
      {
        status: 200,
        headers: {
          'Set-Cookie': 'admin_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
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
    return handleGet(context, pathParts);
  } else if (method === 'POST') {
    return handlePost(context, pathParts);
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
        'Set-Cookie': `admin_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
        'Content-Type': 'text/plain'
      }
    });
  } else {
    return new Response('密码错误', { status: 401 });
  }
}

// ---------- GET 请求：渲染管理页面 ----------
async function handleGet(context, pathParts) {
  const { env } = context;
  let data = await getDataFromKV(env);

  // pathParts: [] → 用户列表
  // pathParts: ['{account}'] → 平台列表
  // pathParts: ['{account}', '{platform}'] → 视频列表
  // pathParts: ['{account}', '{platform}', 'recycle'] → 回收站
  // pathParts: 长度 >= 3 且不是 recycle → 404
  let userId = null;
  let platformId = null;
  let showRecycle = false;

  if (pathParts.length >= 1) {
    userId = pathParts[0];
    if (pathParts.length >= 2) {
      platformId = pathParts[1];
      if (pathParts.length >= 3) {
        if (pathParts[2] === 'recycle') {
          showRecycle = true;
        } else {
          return new Response('Not Found', { status: 404 });
        }
      }
    }
  }

  const html = renderAdminHtml(data, userId, platformId, showRecycle);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' }
  });
}

// ---------- POST 请求：处理所有 API 操作 ----------
async function handlePost(context, pathParts) {
  const { request, env } = context;
  let data = await getDataFromKV(env);
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求体必须是有效的 JSON' }, 400);
  }
  const action = body.action;

  // ---- 操作：添加/删除/编辑用户（不需要路径中的 userId/platformId） ----
  if (action === 'addUser') {
    const uid = (body.userId || '').trim();
    const name = (body.displayName || '').trim();
    if (!uid || !name) return jsonResponse({ error: '用户ID和显示名称不能为空' }, 400);
    if (data.accounts[uid]) return jsonResponse({ error: '用户ID已存在' }, 400);
    data.accounts[uid] = { displayName: name, platforms: {} };
    await saveDataToKV(env, data);
    return jsonResponse({ success: true, message: '用户已添加' });
  }

    if (action === 'deleteUser') {
    const uid = body.userId;
    if (!uid || !data.accounts[uid]) return jsonResponse({ error: '用户不存在' }, 404);
    delete data.accounts[uid];
    await saveDataToKV(env, data);
    return jsonResponse({ success: true, message: '用户已删除' });
  }

  if (action === 'updateUser') {
    const uid = body.userId;
    const name = (body.displayName || '').trim();
    if (!uid || !data.accounts[uid]) return jsonResponse({ error: '用户不存在' }, 404);
    if (!name) return jsonResponse({ error: '显示名称不能为空' }, 400);
    data.accounts[uid].displayName = name;
    await saveDataToKV(env, data);
    return jsonResponse({ success: true, message: '用户已更新' });
  }

  // ---- 操作：添加/删除平台（仅需要 userId，不需要 platformId 路径） ----
  if (action === 'addPlatform') {
    const uid = (body.userId || '').trim();
    const pid = (body.platformId || '').trim();
    const name = (body.displayName || '').trim();
    if (!uid || !pid || !name) return jsonResponse({ error: '参数不完整' }, 400);
    if (!data.accounts[uid]) return jsonResponse({ error: '用户不存在' }, 404);
    if (data.accounts[uid].platforms[pid]) return jsonResponse({ error: '平台ID已存在' }, 400);
    data.accounts[uid].platforms[pid] = { displayName: name, videos: {} };
    await saveDataToKV(env, data);
    return jsonResponse({ success: true, message: '平台已添加' });
  }

    if (action === 'deletePlatform') {
    const uid = body.userId;
    const pid = body.platformId;
    if (!uid || !pid || !data.accounts[uid] || !data.accounts[uid].platforms[pid]) {
      return jsonResponse({ error: '用户或平台不存在' }, 404);
    }
    delete data.accounts[uid].platforms[pid];
    await saveDataToKV(env, data);
    return jsonResponse({ success: true, message: '平台已删除' });
  }

  if (action === 'updatePlatform') {
    const uid = body.userId;
    const pid = body.platformId;
    const name = (body.displayName || '').trim();
    if (!uid || !pid || !data.accounts[uid] || !data.accounts[uid].platforms[pid]) {
      return jsonResponse({ error: '用户或平台不存在' }, 404);
    }
    if (!name) return jsonResponse({ error: '显示名称不能为空' }, 400);
    data.accounts[uid].platforms[pid].displayName = name;
    await saveDataToKV(env, data);
    return jsonResponse({ success: true, message: '平台已更新' });
  }

  // ---- 以下操作需要路径或 body 中的 userId/platformId ----
  let userId, platformId;
  if (pathParts.length >= 2) {
    userId = pathParts[0];
    platformId = pathParts[1];
  } else if (body.userId && body.platformId) {
    userId = body.userId;
    platformId = body.platformId;
  } else {
    return jsonResponse({ error: '路径格式错误或请求体缺少 userId/platformId' }, 400);
  }

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
        let imageUrl = (body.imageUrl || '').trim();
        const affiliateLink = (body.affiliateLink || '').trim();
        if (!title) {
          return jsonResponse({ error: '标题不能为空' }, 400);
        }

        // 自动生成 8 位哈希 ID
        const existingIds = new Set(Object.keys(platform.videos));
        const newId = await generateVideoId(title, existingIds);

        // 图片 URL 为空时根据模式自动填充占位图
        if (!imageUrl) {
          const mode = body.placeholderMode || 'kitten';
          imageUrl = getPlaceholderUrl(mode, newId);
        }

        platform.videos[newId] = {
          id: newId,
          title,
          imageUrl,
          affiliateLink,
          deleted: false,
          deletedAt: null
        };

        // 更新 videoIndex
        if (!data.videoIndex) data.videoIndex = {};
        data.videoIndex[newId] = { userId, platformId };

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
        // 同步删除 videoIndex
        if (data.videoIndex) delete data.videoIndex[videoId];
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
        if (!title) return jsonResponse({ error: '标题不能为空' }, 400);
        platform.videos[videoId].title = title;
        // 图片 URL 留空时根据模式自动填充占位图
        const imageUrl = (body.imageUrl || '').trim();
        if (imageUrl) {
          platform.videos[videoId].imageUrl = imageUrl;
        } else {
          const mode = body.placeholderMode || 'kitten';
          platform.videos[videoId].imageUrl = getPlaceholderUrl(mode, videoId);
        }
        platform.videos[videoId].affiliateLink = (body.affiliateLink || '').trim();
        await saveDataToKV(env, data);
        return jsonResponse({ success: true, message: '视频已更新' });
      }

      // ---------- 移动视频到其他用户/平台 ----------
      case 'moveVideo': {
        const videoId = body.videoId;
        const targetUserId = (body.targetUserId || '').trim();
        const targetPlatformId = (body.targetPlatformId || '').trim();
        if (!videoId || !platform.videos[videoId]) {
          return jsonResponse({ error: '视频不存在' }, 404);
        }
        if (!data.accounts[targetUserId] || !data.accounts[targetUserId].platforms[targetPlatformId]) {
          return jsonResponse({ error: '目标用户或平台不存在' }, 404);
        }
        // 从原位置删除
        const videoObj = platform.videos[videoId];
        delete platform.videos[videoId];
        // 添加到目标位置
        const targetPlatform = data.accounts[targetUserId].platforms[targetPlatformId];
        if (!targetPlatform.videos) targetPlatform.videos = {};
        videoObj.deleted = false;
        videoObj.deletedAt = null;
        targetPlatform.videos[videoId] = videoObj;
        // 更新 videoIndex
        if (!data.videoIndex) data.videoIndex = {};
        data.videoIndex[videoId] = { userId: targetUserId, platformId: targetPlatformId };
        await saveDataToKV(env, data);
        return jsonResponse({ success: true, message: '视频已迁移' });
      }

      default:
        return jsonResponse({ error: '未知操作' }, 400);
    }
    } catch (err) {
    console.error('Admin POST 错误:', err);
    return jsonResponse({ error: '服务器错误: ' + err.message }, 500);
  }
}

// ---- 占位图模式映射 ----
function getPlaceholderUrl(mode, seed) {
  switch (mode) {
    case 'dog':
      return `https://placedog.net/400/229?random=${seed}`;
    case 'random':
      return `https://loremflickr.com/400/225/pet?random=${seed}`;
    case 'kitten':
    default:
      return `https://placekitten.com/400/225`;
  }
}
