// functions/lib/db.js

export async function getDataFromKV(env) {
  try {
    var stored = await env.DATA.get('petvid_data');
    if (stored) {
      return JSON.parse(stored);
    }
    return {};
  } catch(e) {
    return {};
  }
}

export async function saveDataToKV(env, data) {
  await env.DATA.put('petvid_data', JSON.stringify(data));
}
