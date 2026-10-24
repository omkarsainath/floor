import { activateUserStorage } from './storage.js';

export const TAB_USER_KEY = 'ai3d:signed-in-user';
const AUTH_EVENT = 'ai3d:auth-change';
const allowedPages = new Set(['/tracer.html', '/builder.html', '/index.html', '/admin.html', '/']);

export function safeNext(value) {
    try {
        const url = new URL(value || '/tracer.html', location.origin);
        if (url.origin === location.origin && allowedPages.has(url.pathname)) return url.pathname + url.search;
    } catch { /* Use the tracer for malformed links. */ }
    return '/tracer.html';
}

export async function request(path, data) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(path, {
            method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
            ...(data === undefined ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)}),
            signal: controller.signal,
        });
        let result;
        try { result = await response.json(); } catch { throw Error('The account server is unavailable. Start or restart npm run backend.'); }
        if (!response.ok) {
            const error = Error(result.error || 'The request could not be completed.');
            error.status = response.status;
            throw error;
        }
        return result;
    } catch (error) {
        if (error.name === 'AbortError' || error instanceof TypeError) throw Error('Cannot reach the account server. Start or restart npm run backend, then try again.');
        throw error;
    } finally { clearTimeout(timer); }
}

export function announceSignIn(user) {
    sessionStorage.setItem(TAB_USER_KEY, user.id);
    localStorage.setItem(AUTH_EVENT, JSON.stringify({userId: user.id, at: Date.now()}));
}

function loginRedirect() {
    sessionStorage.removeItem(TAB_USER_KEY);
    document.documentElement.setAttribute('data-auth-pending', '');
    location.replace('/login.html?next=' + encodeURIComponent(safeNext(location.pathname + location.search)));
    return new Promise(() => {});
}

function showGateError(message) {
    document.body.replaceChildren();
    const panel = document.createElement('section');
    panel.style.cssText = 'margin:8vh auto;padding:28px;max-width:500px;background:white;color:#172033;border-radius:16px;font:16px/1.6 system-ui';
    const title = document.createElement('h1'); title.textContent = 'Unable to open the application';
    const detail = document.createElement('p'); detail.textContent = message;
    const retry = document.createElement('button'); retry.textContent = 'Try again'; retry.onclick = () => location.reload();
    const login = document.createElement('a'); login.href = '/login.html'; login.textContent = 'Back to sign in'; login.style.marginLeft = '16px';
    panel.append(title, detail, retry, login); document.body.append(panel);
    document.documentElement.removeAttribute('data-auth-pending');
    return new Promise(() => {});
}

export async function requireSession({admin = false} = {}) {
    try {
        if (!sessionStorage.getItem(TAB_USER_KEY)) return loginRedirect();
        const {user} = await request('/api/auth/me');
        if (!user?.id) throw Error('Restart npm run backend to enable the new login system.');
        if (user.id !== sessionStorage.getItem(TAB_USER_KEY)) return loginRedirect();
        if (admin && user.role !== 'admin') return showGateError('This page is for administrators. Your account can use the floor plan application.');
        activateUserStorage(user);
        let checking = false;
        const heartbeat = async () => {
            if (document.hidden || checking) return;
            checking = true;
            try {
                const result = await request('/api/auth/heartbeat', {});
                if (result.user?.id !== user.id) await loginRedirect();
            } catch (error) {
                if (error.status === 401 || error.status === 403) await loginRedirect();
            } finally { checking = false; }
        };
        await heartbeat();
        setInterval(heartbeat, 60000);
        document.addEventListener('visibilitychange', heartbeat);
        window.addEventListener('pageshow', event => { if (event.persisted) heartbeat(); });
        window.addEventListener('storage', event => {
            if (event.key !== AUTH_EVENT) return;
            try { if (JSON.parse(event.newValue || '{}').userId !== user.id) loginRedirect(); } catch { loginRedirect(); }
        });
        document.documentElement.removeAttribute('data-auth-pending');
        return user;
    } catch (error) {
        if (error.status === 401) return loginRedirect();
        return showGateError(error.message);
    }
}

export function mountAccountMenu(user) {
    const style = document.createElement('style');
    style.textContent = `
        #account-menu{position:fixed;top:12px;right:20px;z-index:100;color:#243858;font:14px/1.5 system-ui}
        #account-menu summary{box-sizing:border-box;display:grid;place-items:center;width:40px;height:40px;padding:0;list-style:none;cursor:pointer;background:#eef0ff;color:#4855dc;border:1px solid #dce0ff;border-radius:50%;box-shadow:none;font-size:17px;font-weight:700;user-select:none}
        #account-menu summary::-webkit-details-marker{display:none}
        #account-menu summary:hover{background:#e0e4ff}
        #account-menu summary:focus-visible{outline:3px solid #8d9aff;outline-offset:3px}
        #account-menu .account-body{box-sizing:border-box;position:absolute;top:50px;right:0;width:260px;max-width:calc(100vw - 24px);padding:16px;display:grid;gap:6px;background:white;border:1px solid #e3e7ef;border-radius:12px;box-shadow:0 12px 36px #1720331f}
        #account-menu:not([open]) .account-body{display:none}
        #account-menu p{margin:0;overflow-wrap:anywhere}
        #account-menu .account-name{font-weight:650;font-size:14px}
        #account-menu .account-email{color:#778197;font-size:12px;margin-bottom:10px}
        #account-menu a{color:#4054d5}
        #account-menu button{margin:0;border:0;border-top:1px solid #edf0f5;background:#fff;color:#b64343;border-radius:0;padding:12px 0 0;text-align:left;font:inherit;cursor:pointer}
        #account-menu button:hover{background:#f1f3ff}
        #account-menu [role=status]:empty{display:none}
    `;
    document.head.append(style);
    const menu = document.createElement('details'); menu.id = 'account-menu';
    const summary = document.createElement('summary');
    const name = user.name?.trim() || user.email || 'Account';
    summary.textContent = Array.from(name)[0].toLocaleUpperCase();
    summary.setAttribute('aria-label', `Account menu for ${name}`);
    summary.title = `Account · ${name}`;
    const body = document.createElement('div'); body.className = 'account-body';
    const displayName = document.createElement('p'); displayName.className = 'account-name'; displayName.textContent = name; body.append(displayName);
    const email = document.createElement('p'); email.className = 'account-email'; email.textContent = user.email; body.append(email);
    if (user.role === 'admin') {
        const link = document.createElement('a'); link.href = '/admin.html'; link.textContent = 'Admin dashboard'; body.append(link);
    }
    const logout = document.createElement('button'); logout.id = 'account-logout'; logout.textContent = 'Sign out';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    logout.onclick = async () => {
        logout.disabled = true;
        try {
            await request('/api/auth/logout', {});
            sessionStorage.removeItem(TAB_USER_KEY);
            localStorage.setItem(AUTH_EVENT, JSON.stringify({userId: null, at: Date.now()}));
            location.replace('/login.html');
        } catch (error) { status.textContent = error.message; logout.disabled = false; }
    };
    body.append(logout, status); menu.append(summary, body); document.body.append(menu);
    document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) menu.open = false; });
    menu.addEventListener('keydown', event => { if (event.key === 'Escape') { menu.open = false; summary.focus(); } });
    for (const type of ['keydown', 'keyup', 'pointerdown']) menu.addEventListener(type, event => event.stopPropagation());
}
