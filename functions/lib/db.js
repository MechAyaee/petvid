// functions/lib/db.js

import { sanitizeData } from './helpers.js';

export async function getDataFromKV(env) {
  try {
    const stored = await env.DATA.get('petvid_data');
    if (stored) {
      return sanitizeData(JSON.parse(stored));
    }
    return sanitizeData({});
  } catch(e) {
    return sanitizeData({});
  }
}

export async function saveDataToKV(env, data) {
  data = sanitizeData(data);

  // 重建 videoIndex：扫描所有未删除的视频
  const videoIndex = {};
  for (const [userId, user] of Object.entries(data.accounts || {})) {
    for (const [platformId, platform] of Object.entries(user.platforms || {})) {
      for (const [videoId, video] of Object.entries(platform.videos || {})) {
        if (!video.deleted) {
          videoIndex[video.id || videoId] = { userId, platformId };
        }
      }
    }
  }
  data.videoIndex = videoIndex;

  await env.DATA.put('petvid_data', JSON.stringify(data));
}
