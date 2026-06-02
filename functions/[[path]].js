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

// === 📦 备份数据（仅当 KV 不可用时使用） ===
const FALLBACK_DATA = {
  accounts: {
    marytiger: {
      displayName: "Mary Tiger",
      platforms: {
        abs: {
          displayName: "Abstrem",
          videos: {
            M008: { title: "猫咪日常", imageUrl: "https://placekitten.com/400/225", affiliateLink: "https://example.com/ads/m008" },
            M009: { title: "狗狗玩耍", imageUrl: "https://placedog.net/400/225", affiliateLink: "https://example.com/ads/m009" }
          }
        }
      }
    },
    johnDoe: {
      displayName: "John Doe",
      platforms: {
        tube: {
          displayName: "Tuber",
          videos: {
            V001: { title: "旅行日记", imageUrl: "https://picsum.photos/400/225?random=1", affiliateLink: "https://example.com/ads/v001" }
          }
        }
      }
    }
  }
};

const KV_DATA_KEY = 'petvid_data';

// === 📦 从 KV 读取数据（自动种子） ===
async function getData(env) {
  // 如果 KV 绑定存在
  if (env.DATA && typeof env.DATA.get === 'function') {
    try {
      const stored = await env.DATA.get(KV_DATA_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
      // 🚀 首次部署 → 自动将备份数据写入 KV
      await env.DATA.put(KV_DATA_KEY, JSON.stringify(FALLBACK_DATA));
      return FALLBACK_DATA;
    } catch (e) {
      console.error('KV 读取失败，使用备份数据:', e);
      return FALLBACK_DATA;
    }
  }
  // KV 绑定不可用（如本地开发）→ 使用备份
  return FALLBACK_DATA;
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

export async function onRequest(context) {
  const { request, params, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // ★ 关键修复：静态文件放行
  if (pathname.match(/\.\w+$/)) {
    try {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) {
        return response;
      }
    } catch (e) {
      // ASSETS 不可用时，继续走函数逻辑
    }
  }

  // ========== 📦 从 KV 获取数据 ==========
  const data = await getData(env);

  const pathParts = params.path || [];

  if (pathParts.length === 0) {
    const body = `
      <h1>我的视频中转站</h1>
      <div class="folder-grid">
        ${Object.entries(data.accounts).map(([id, acc]) => {
          const userColor = getUserColor(acc.displayName);
          return `<a href="/${id}" class="account-folder" style="--card-color: ${userColor}">
            <div class="folder-icon">📁</div>
            <span>${acc.displayName}</span>
          </a>`;
        }).join('')}
      </div>`;
    return new Response(htmlTemplate('PetVid - 账号列表', body), {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  const [accountId, platformId, videoId] = pathParts;
  const account = data.accounts[accountId];
  if (!account) {
    return new Response(render404Page(`账号 "${accountId}" 不存在`), {
      status: 404, headers: { 'Content-Type': 'text/html' }
    });
  }

  if (pathParts.length === 1) {
    const userColor = getUserColor(account.displayName);
    const body = `
      <div class="breadcrumb"><a href="/">首页</a> &gt; ${account.displayName}</div>
      <h2 style="text-align:center; color: ${userColor};">${account.displayName} 的视频平台</h2>
      <div class="folder-grid">
        ${Object.entries(account.platforms).map(([id, plat]) => {
          const platColor = getPlatformColor(plat.displayName);
          return `<a href="/${accountId}/${id}" class="folder" style="--card-color: ${platColor}">
            <div class="folder-icon">📂</div>
            <span>${plat.displayName}</span>
          </a>`;
        }).join('')}
      </div>`;
    return new Response(htmlTemplate(`${account.displayName} - 平台列表`, body), {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  const platform = account.platforms[platformId];
  if (!platform) {
    return new Response(render404Page(`平台 "${platformId}" 不存在`), {
      status: 404, headers: { 'Content-Type': 'text/html' }
    });
  }

  if (pathParts.length === 2) {
    const body = `
      <div class="breadcrumb">
        <a href="/">首页</a> &gt; 
        <a href="/${accountId}">${accountId}</a> &gt; 
        ${platform.displayName}
      </div>
      <h2 style="text-align:center;">${platform.displayName}</h2>
      <div class="video-grid">
        ${Object.entries(platform.videos).map(([vid, info]) => `
          <div class="video-card">
            <a href="/${accountId}/${platformId}/${vid}">
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

  const video = platform.videos[videoId];
  if (!video) {
    return new Response(render404Page(`视频 "${videoId}" 不存在`), {
      status: 404, headers: { 'Content-Type': 'text/html' }
    });
  }

  if (pathParts.length === 3) {
    const body = `
      <div class="breadcrumb">
        <a href="/">首页</a> &gt; 
        <a href="/${accountId}">${accountId}</a> &gt; 
        <a href="/${accountId}/${platformId}">${platformId}</a> &gt; 
        ${videoId}
      </div>
      <div class="video-page">
        <h1>${video.title}</h1>
        <div class="meta">${accountId} · ${platformId}</div>
        <div id="ayaee">
          <a href="${video.affiliateLink}" target="_blank" rel="noopener noreferrer">
            <img src="${video.imageUrl}" alt="${video.title}" style="max-width:100%; border-radius:12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
          </a>
        </div>
        <p>点击图片前往广告商页面</p>
        <a href="/${accountId}/${platformId}" class="back-link">← 返回视频列表</a>
      </div>`;
    return new Response(htmlTemplate(video.title, body), {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  return new Response(render404Page('无效路径'), {
    status: 404, headers: { 'Content-Type': 'text/html' }
  });
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
