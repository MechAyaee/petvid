// functions/lib/helpers.js

/**
 * 转义 HTML 文本内容（防止 XSS）
 */
export function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
}

/**
 * 转义 HTML 属性值（防止 XSS）
 */
export function escapeHtmlAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
}

/**
 * 转义 JS 字符串（用于 onclick 等属性）
 */
export function escapeJsStr(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
}

/**
 * 返回 JSON 格式响应
 */
export function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * SHA-256 哈希
 */
export async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 自动生成 8 位视频哈希 ID（保证不重复）
 * @param {string} title - 视频标题，用于增加随机性
 * @param {Set<string>} existingIds - 已有 ID 集合，用于碰撞检测
 * @returns {string} 8 位十六进制字符串
 */
export async function generateVideoId(title, existingIds) {
  if (!existingIds) existingIds = new Set();
  let id;
  do {
    const hash = await sha256(title + Date.now() + Math.random());
    id = hash.slice(0, 8);   // 取前 8 位作为 ID
  } while (existingIds.has(id));
  return id;
}

/**
 * 兼容旧数据：确保数据结构中包含 `deleted`、`id`、`videoIndex` 等字段
 * 调用时机：每次从 KV 读取数据后
 */
export function sanitizeData(data) {
  if (!data) data = {};
  if (!data.accounts) data.accounts = {};
  if (!data.videoIndex) data.videoIndex = {};   // 哈希 -> { userId, platformId }

  const userIds = Object.keys(data.accounts);
  for (const userId of userIds) {
    const user = data.accounts[userId];
    if (!user.platforms) user.platforms = {};
    const platformIds = Object.keys(user.platforms);
    for (const platformId of platformIds) {
      const platform = user.platforms[platformId];
      if (!platform.videos) platform.videos = {};
      const videoIds = Object.keys(platform.videos);
      for (const videoId of videoIds) {
        const video = platform.videos[videoId];
        // 兼容旧数据：添加 deleted 字段
        if (video.deleted === undefined) video.deleted = false;
        if (video.deletedAt === undefined) video.deletedAt = null;
        // 兼容旧数据：添加 id 字段（哈希值），如果不一致则使用 videoId 作为 id
        if (!video.id) video.id = videoId;  // 旧数据中 videoId 本身可能不是哈希，但保留
        // 注意：旧数据中 videoId 是用户自定义的短 ID，我们将在后端 addVideo 时统一改为哈希。
        // 此处不改变原有键名，仅新增 id 字段（哈希）。
      }
    }
  }
  return data;
}
