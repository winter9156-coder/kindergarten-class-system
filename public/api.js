/* ============================================================
 *  前后端 API 桥接（替换 localStorage）
 *  前后端同源部署：Render 后端直接提供前端页面 + API
 * ============================================================ */

// API_BASE：前后端同源时用空字符串（相对路径），跨域时用完整 Render URL
const API_BASE = (function() {
    const host = window.location.hostname;
    // 本地开发 / 同源部署 → 相对路径即可
    if (host === 'localhost' || host === '127.0.0.1' || host.includes('onrender.com')) return '';
    // 其他跨域部署（如 COS）→ 使用 Render 后端完整 URL
    return 'https://kindergarten-class-api.onrender.com';
})();

// 提取当前页面 URL 中的认证参数
function getAuthParams() {
    const params = new URLSearchParams(window.location.search);
    const eoToken = params.get('eo_token');
    const eoTime = params.get('eo_time');
    if (eoToken && eoTime) {
        return '?eo_token=' + encodeURIComponent(eoToken) + '&eo_time=' + encodeURIComponent(eoTime);
    }
    return '';
}

function authFetch(url, options) {
    const auth = getAuthParams();
    const separator = url.includes('?') ? '&' : (auth ? '?' : '');
    const fullUrl = API_BASE + url + separator + (auth ? auth.substring(1) : '');
    return fetch(fullUrl, options);
}

// ===== 备用：localStorage 模式（当后端不可用时） =====
const SK_LEADER = 'kindergarten_leader_choices';
const SK_TEACHER = 'kindergarten_teacher_choices';

let useLocalStorage = false;

function lsGet(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : {}; }
    catch { return {}; }
}

function lsSet(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// ===== 公开 API 函数 =====

async function apiGetAllData() {
    if (useLocalStorage) {
        return { leaders: lsGet(SK_LEADER), teachers: lsGet(SK_TEACHER) };
    }
    try {
        const res = await authFetch('/api/data');
        const json = await res.json();
        return json.data;
    } catch (e) {
        // 后端不可用，降级到 localStorage
        useLocalStorage = true;
        return { leaders: lsGet(SK_LEADER), teachers: lsGet(SK_TEACHER) };
    }
}

async function apiGetLeader(name) {
    if (useLocalStorage) return (lsGet(SK_LEADER)[name]) || null;
    try {
        const res = await authFetch('/api/leader/' + encodeURIComponent(name));
        const json = await res.json();
        return json.choice;
    } catch { return null; }
}

async function apiSaveLeader(name, selected) {
    try {
        const res = await authFetch('/api/leader/' + encodeURIComponent(name), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selected })
        });
        return await res.json();
    } catch {
        // 后端不可用，保存到 localStorage
        const data = lsGet(SK_LEADER);
        data[name] = { selected, submitted: true, timestamp: new Date().toISOString() };
        lsSet(SK_LEADER, data);
        return { success: true };
    }
}

async function apiGetTeacher(name) {
    if (useLocalStorage) return (lsGet(SK_TEACHER)[name]) || null;
    try {
        const res = await authFetch('/api/teacher/' + encodeURIComponent(name));
        const json = await res.json();
        return json.choice;
    } catch { return null; }
}

async function apiSaveTeacher(name, leaders, teachers) {
    try {
        const res = await authFetch('/api/teacher/' + encodeURIComponent(name), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leaders, teachers })
        });
        return await res.json();
    } catch {
        const data = lsGet(SK_TEACHER);
        data[name] = { leaders, teachers, submitted: true, timestamp: new Date().toISOString() };
        lsSet(SK_TEACHER, data);
        return { success: true };
    }
}

async function apiAdminClear(key) {
    try {
        const res = await authFetch('/api/admin/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key })
        });
        return await res.json();
    } catch {
        localStorage.clear();
        return { success: true, message: '已本地清空' };
    }
}
