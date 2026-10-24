import './pages.css';
import { request, announceSignIn, safeNext } from './client.js';
const $ = selector => document.querySelector(selector);
let registering = false, busy = false;
function mode(register) {
    registering = register;
    $('#name-field').hidden = !register; $('#name').required = register;
    $('#password-hint').hidden = !register;
    $('#password').minLength = register ? 12 : 1;
    $('#password').autocomplete = register ? 'new-password' : 'current-password';
    $('#form-title').textContent = register ? 'Make room for your ideas' : 'Sign in to your workspace';
    $('#form-description').textContent = register ? 'Create an account to start planning.' : 'Your plans are ready when you are.';
    $('#submit-auth').textContent = register ? 'Create account →' : 'Sign in →';
    $('#login-tab').setAttribute('aria-pressed', String(!register)); $('#register-tab').setAttribute('aria-pressed', String(register));
    $('#auth-status').textContent = '';
}
$('#login-tab').onclick = () => { if (!busy) mode(false); };
$('#register-tab').onclick = () => { if (!busy) mode(true); };
$('#show-password').onclick = () => {
    const visible = $('#password').type === 'password'; $('#password').type = visible ? 'text' : 'password';
    $('#show-password').textContent = visible ? 'Hide' : 'Show'; $('#show-password').setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
};
function signedIn(result) {
    if (!result.user?.id) throw Error('Restart npm run backend to enable the new login system.');
    announceSignIn(result.user);
    location.replace(safeNext(new URLSearchParams(location.search).get('next')));
}
$('#auth-form').onsubmit = async event => {
    event.preventDefault(); if (busy) return; busy = true; $('#submit-auth').disabled = true;
    $('#auth-status').textContent = registering ? 'Creating your account…' : 'Signing in…';
    try {
        signedIn(await request(registering ? '/api/auth/register' : '/api/auth/login', {
            email: $('#email').value.trim(), password: $('#password').value, name: $('#name').value.trim(),
        }));
    } catch (error) { $('#auth-status').textContent = error.message; }
    finally { busy = false; $('#submit-auth').disabled = false; }
};

async function googleSignIn() {
    try {
        const config = await request('/api/auth/config');
        if (!Object.hasOwn(config, 'google_client_id')) throw Error('Restart npm run backend to enable Google sign-in configuration.');
        if (!config.google_client_id) {
            const button = document.createElement('button'); button.type = 'button'; button.disabled = true; button.textContent = 'Sign in with Google';
            $('#google-button').append(button);
            $('#google-status').textContent = 'Google sign-in is not configured yet. Use email and password.'; return;
        }
        await new Promise((resolve, reject) => {
            const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
            const timeout = setTimeout(() => reject(Error('Google sign-in could not load. Use email and password, or refresh to retry.')), 15000);
            script.onload = () => { clearTimeout(timeout); resolve(); }; script.onerror = () => { clearTimeout(timeout); reject(Error('Google sign-in could not load. Use email and password.')); };
            document.head.append(script);
        });
        const {nonce} = await request('/api/auth/google-nonce', {});
        google.accounts.id.initialize({client_id: config.google_client_id, nonce, auto_select: false, callback: async response => {
            if (busy) return; busy = true; $('#submit-auth').disabled = true;
            $('#auth-status').textContent = 'Verifying Google sign-in…';
            try { signedIn(await request('/api/auth/google', {credential: response.credential})); }
            catch (error) { $('#auth-status').textContent = error.message + ' Refresh the page before trying Google again.'; }
            finally { busy = false; $('#submit-auth').disabled = false; }
        }});
        google.accounts.id.renderButton($('#google-button'), {type: 'standard', theme: 'outline', size: 'large', width: Math.min(380, $('#google-button').clientWidth), text: 'signin_with'});
        $('#google-status').textContent = '';
    } catch (error) { $('#google-status').textContent = error.message; }
}
googleSignIn();
