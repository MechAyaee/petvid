// functions/lib/db.js

import { sanitizeData } from './helpers.js';

/**
 * 从 KV 读取数据，并自动兼容旧数据结构
 */
export async function getDataFromKV(env) {
  try {
    var stored = await env.DATA.get('petvid_data');
    if (stored) {
      var data = JSON.parse(stored);
      // 兼容旧数据：补全 deleted、videoIndex 等字段
      return sanitizeData(data);
    }
    // 完全空数据，也进行兼容初始化
    return sanitizeData({});
  } catch(e) {
    return sanitizeData({});
  }
}

/**
 * 保存数据到 KV，并自动重建 videoIndex（哈希索引表）
 */
export async function saveDataToKV(env, data) {
  // 先确保数据结构完整
  data = sanitizeData(data);

  // 重建 videoIndex：扫描所有未删除的视频
  const videoIndex = {};
  const userIds = Object.keys(data.accounts || {});
  for (const userId of userIds) {
    const user = data.accounts[userId];
    for (const platformId of Object.keys(user.platforms || {})) {
      const platform = user.platforms[platformId];
      for (const videoId of Object.keys(platform.videos || {})) {
        const video = platform.videos[videoId];
        // 只索引未删除的视频（deleted 为 false 或未定义）
        if (video.deleted === false || video.deleted === undefined) {
          // 使用视频的 id 字段（未来是哈希）或视频的键（向后兼容）
          const key = video.id || videoId;
          videoIndex[key] = { userId, platformId };
        }
      }
    }
  }
  data.videoIndex = videoIndex;

  // 写入 KV
  await env.DATA.put('petvid_data', JSON.stringify(data));
}
