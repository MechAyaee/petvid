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
      <a href="/">Back to Home</a>
    </div>`;
  return htmlTemplate('404 - Page Not Found', body);
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
      return new Response(render404Page(`Video not found`), {
        status: 404, headers: { 'Content-Type': 'text/html' }
      });
    }
    const account = data.accounts[videoRef.userId];
    const platform = account?.platforms[videoRef.platformId];
    const video = platform?.videos[hashId];
    if (!video || video.deleted) {
      return new Response(render404Page(`Video not found`), {
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
        <p>Click the image to watch the video</p>
        <a href="/" class="back-link">← Back to Home</a>
      </div>`;
    return new Response(htmlTemplate(video.title, body), {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  // ========================================
  // 🔀 三级路径 /{account}/{platform}/{hash} — 重定向到 /v/{hash}
  // ========================================
  if (pathParts.length === 3) {
    const hashId = pathParts[2];
    const videoRef = data.videoIndex && data.videoIndex[hashId];
    if (videoRef) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/v/${hashId}` }
      });
    }
    return new Response(render404Page('Page Not Found'), {
      status: 404, headers: { 'Content-Type': 'text/html' }
    });
  }

  return new Response(render404Page('Page Not Found'), {
    status: 404, headers: { 'Content-Type': 'text/html' }
  });
}
