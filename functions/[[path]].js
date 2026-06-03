// ---- 导入认证函数（必须放在文件最顶部） ----
import { checkAuth } from './lib/auth.js';

// === 颜色映射函数 ===
const USER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#2980b9',
];
const PLATFORM_COLORS = [
  '#e74c3c80', '#3498db80', '#2ecc7180', '#f39c1280',
  '#9b59b680', '#1abc9c80', '#e67e2280', '#2980b980',
];

function getUserColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

function getPlatformColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PLATFORM_COLORS[Math.abs(hash) % PLATFORM_COLORS.length];
}

const KV_DATA_KEY = 'petvid_data';

// === 📦 从 KV 读取数据 ===
async function getData(env) {
  if (env.DATA && typeof env.DATA.get === 'function') {
    try {
      const stored = await env.DATA.get(KV_DATA_KEY);
      if (stored) return JSON.parse(stored);
      await env.DATA.put(KV_DATA_KEY, JSON.stringify({ accounts: {} }));
      return { accounts: {} };
    } catch (e) {
      console.error('KV 读取失败:', e);
      return { accounts: {} };
    }
  }
  return { accounts: {} };
}

// 辅助：构建完整 HTML 模板
function htmlTemplate(title, bodyContent) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="container">
    ${bodyContent}
  </div>
</body>
</html>`;
}

// ---- 404 页面渲染 ----
function render404Page(msg) {
  const body = `
    <div class="error-page">
      <h1>404</h1>
      <p>${msg}</p>
      <a href="/">返回首页</a>
    </div>`;
  return htmlTemplate('404 - 页面未找到', body);
}

// ---- 收集所有未删除的视频（用于公开首页） ----
function collectAllVideos(data) {
  const allVideos = [];
  const videoIndex = data.videoIndex || {};
  for (const [hashId, ref] of Object.entries(videoIndex)) {
    const account = data.accounts[ref.userId];
    const platform = account?.platforms[ref.platformId];
    const video = platform?.videos[hashId];
    if (video && !video.deleted) {
      allVideos.push({
        hashId,
        title: video.title || hashId,
        imageUrl: video.imageUrl
      });
    }
  }
  // 按标题排序，让展示有序
  allVideos.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
  return allVideos;
}

export async function onRequest(context) {
  const { request, params, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 静态文件放行
  if (pathname.match(/\.\w+$/)) {
    try {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) return response;
    } catch (e) {
      // ASSETS 不可用时，继续走函数逻辑
    }
  }

  // ========== 📦 从 KV 获取数据 ==========
  const data = await getData(env);

  const pathParts = params.path || [];

  // ========================================
  // 🌐 公开首页 — 展示所有视频卡片
  // ========================================
  if (pathParts.length === 0) {
    const allVideos = collectAllVideos(data);
    const videoCards = allVideos.length === 0
      ? '<p style="text-align:center; color:#888; margin-top:3rem;">暂无视频</p>'
      : `<div class="video-grid">${allVideos.map(v => `
        <div class="video-card">
          <a href="/v/${v.hashId}">
            <img src="${v.imageUrl}" alt="${v.title}" class="video-cover" loading="lazy" onerror="this.src='https://via.placeholder.com/320x180?text=No+Image'">
            <div class="video-info">
              <h3>${v.title}</h3>
            </div>
          </a>
        </div>
      `).join('')}</div>`;

    const body = `
      <h1>PetVid</h1>
      ${videoCards}`;
    return new Response(htmlTemplate('PetVid', body), {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  // ========================================
  // 🆕 公开路径：/v/{hash}
  // ========================================
  if (pathParts.length === 2 && pathParts[0] === 'v') {
    const hashId = pathParts[1];
    const videoRef = data.videoIndex && data.videoIndex[hashId];
    if (!videoRef) {
      return new Response(render404Page(`视频未找到`), {
        status: 404, headers: { 'Content-Type': 'text/html' }
      });
    }
    const account = data.accounts[videoRef.userId];
    const platform = account?.platforms[videoRef.platformId];
    const video = platform?.videos[hashId];
    if (!video || video.deleted) {
      return new Response(render404Page(`视频未找到`), {
        status: 404, headers: { 'Content-Type': 'text/html' }
      });
    }
    const body = `
      <div class="video-page">
        <h1>${video.title}</h1>
        <div id="ayaee">
          <a href="${video.affiliateLink}" target="_blank" rel="noopener noreferrer">
            <img src="${video.imageUrl}" alt="${video.title}" style="max-width:100%; border-radius:12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
          </a>
        </div>
        <p>点击图片前往广告商页面</p>
        <a href="/" class="back-link">← 返回首页</a>
      </div>`;
    return new Response(htmlTemplate(video.title, body), {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  // ========================================
  // 🔒 旧路径 /{account}/{platform}/{videoId} — 仅管理员
  // ========================================
  const adminPassword = env.ADMIN_PASSWORD;
  const cookie = request.headers.get('Cookie');
  const isAdmin = adminPassword ? await checkAuth(cookie, adminPassword) : false;

  const [acctId, pltId, vidId] = pathParts;

  // 三级路径：/{account}/{platform}/{videoId}
  if (pathParts.length === 3) {
    const videoRef = data.videoIndex && data.videoIndex[vidId];
    // 访客：重定向到 /v/{vidId}
    if (!isAdmin) {
      if (videoRef) {
        return new Response(null, {
          status: 302,
          headers: { Location: `/v/${vidId}` }
        });
      }
      // videoIndex 中没有这个 ID → 404
      return new Response(render404Page('页面未找到'), {
        status: 404, headers: { 'Content-Type': 'text/html' }
      });
    }
    // 管理员：正常显示
    const account = data.accounts[acctId];
    if (!account) {
      return new Response(render404Page(`账号 "${acctId}" 不存在`), {
        status: 404, headers: { 'Content-Type': 'text/html' }
      });
    }
    const platform = account.platforms[pltId];
    if (!platform) {
      return new Response(render404Page(`平台 "${pltId}" 不存在`), {
        status: 404, headers: { 'Content-Type': 'text/html' }
      });
    }
    const video = platform.videos[vidId];
    if (!video) {
      return new Response(render404Page(`视频 "${vidId}" 不存在`), {
        status: 404, headers: { 'Content-Type': 'text/html' }
      });
    }
    const body = `
      <div class="breadcrumb">
        <a href="/">首页</a> &gt; 
        <a href="/${acctId}">${account.displayName}</a> &gt; 
        <a href="/${acctId}/${pltId}">${pltId}</a> &gt; 
        ${vidId}
      </div>
      <div class="video-page">
        <h1>${video.title}</h1>
        <div class="meta">${acctId} · ${pltId}</div>
        <div id="ayaee">
          <a href="${video.affiliateLink}" target="_blank" rel="noopener noreferrer">
            <img src="${video.imageUrl}" alt="${video.title}" style="max-width:100%; border-radius:12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
          </a>
        </div>
        <p>点击图片前往广告商页面</p>
        <a href="/${acctId}/${pltId}" class="back-link">← 返回视频列表</a>
      </div>`;
    return new Response(htmlTemplate(video.title, body), {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  // 一级/二级路径：仅管理员可见，访客返回 404
  if (!isAdmin) {
    return new Response(render404Page('页面未找到'), {
      status: 404, headers: { 'Content-Type': 'text/html' }
    });
  }

  // ---- 管理员：一级路径 /{account} ----
  if (pathParts.length === 1) {
    const account = data.accounts[acctId];
    if (!account) {
      return new Response(render404Page(`账号 "${acctId}" 不存在`), {
        status: 404, headers: { 'Content-Type': 'text/html' }
      });
    }
    const userColor = getUserColor(account.displayName);
    const body = `
      <div class="breadcrumb"><a href="/">首页</a> &gt; ${account.displayName}</div>
      <h2 style="text-align:center; color: ${userColor};">${account.displayName} 的视频平台</h2>
      <div class="folder-grid">
        ${Object.entries(account.platforms).map(([id, plat]) => {
          const platColor = getPlatformColor(plat.displayName);
          return `<a href="/${acctId}/${id}" class="folder" style="--card-color: ${platColor}">
            <div class="folder-icon">📂</div>
            <span>${plat.displayName}</span>
          </a>`;
        }).join('')}
      </div>`;
    return new Response(htmlTemplate(`${account.displayName} - 平台列表`, body), {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  // ---- 管理员：二级路径 /{account}/{platform} ----
  if (pathParts.length === 2) {
    const account = data.accounts[acctId];
    if (!account) {
      return new Response(render404Page(`账号 "${acctId}" 不存在`), {
        status: 404, headers: { 'Content-Type': 'text/html' }
      });
    }
    const platform = account.platforms[pltId];
    if (!platform) {
      return new Response(render404Page(`平台 "${pltId}" 不存在`), {
        status: 404, headers: { 'Content-Type': 'text/html' }
      });
    }
    const body = `
      <div class="breadcrumb">
        <a href="/">首页</a> &gt; 
        <a href="/${acctId}">${account.displayName}</a> &gt; 
        ${platform.displayName}
      </div>
      <h2 style="text-align:center;">${platform.displayName}</h2>
      <div class="video-grid">
        ${Object.entries(platform.videos).map(([vid, info]) => `
          <div class="video-card">
            <a href="/${acctId}/${pltId}/${vid}">
              <img src="${info.imageUrl}" alt="${info.title}" class="video-cover" loading="lazy" onerror="this.src='https://via.placeholder.com/320x180?text=No+Image'">
              <div class="video-info">
                <h3>${info.title || vid}</h3>
                <span>${platform.displayName}</span>
              </div>
            </a>
          </div>
        `).join('')}
      </div>`;
    return new Response(htmlTemplate(`${platform.displayName} - 视频列表`, body), {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  
  return new Response(render404Page('无效路径'), {
    status: 404, headers: { 'Content-Type': 'text/html' }
  });
}
