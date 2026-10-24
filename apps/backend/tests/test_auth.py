import io
import json
import sys
import tempfile
import unittest
from email.message import Message
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from auth import AuthStore, AuthHTTP, AuthError, COOKIE, NONCE_COOKIE, IDLE_SECONDS, digest


class Request:
    def __init__(self, path, method='GET', data=None, token=None, origin='http://localhost:5173', content_type='application/json', nonce=None):
        self.path, self.command = path, method
        body = json.dumps(data or {}).encode()
        self.headers = Message()
        self.headers['Content-Type'] = content_type
        self.headers['Content-Length'] = str(len(body))
        if origin is not None:
            self.headers['Origin'] = origin
        self.headers['Cookie'] = '; '.join(f'{key}={value}' for key, value in [(COOKIE, token), (NONCE_COOKIE, nonce)] if value)
        self.client_address = ('127.0.0.1', 1000)
        self.rfile, self.wfile = io.BytesIO(body), io.BytesIO()
        self.response_headers = []

    def send_response(self, status): self.status = status
    def send_header(self, key, value): self.response_headers.append((key, value))
    def end_headers(self): pass
    @property
    def result(self): return json.loads(self.wfile.getvalue())


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.now = 1800000000
        self.store = AuthStore(Path(self.temp.name) / 'auth.sqlite3', clock=lambda: self.now, google_client_id='test-client')
        self.http = AuthHTTP(self.store)

    def register(self, email='user@example.com'):
        return self.store.register(email, 'a-long-test-password', 'Test user')

    def send(self, path, method='GET', **kwargs):
        request = Request(path, method, **kwargs)
        self.assertTrue(self.http.handle(request))
        return request

    def test_passwords_and_tokens_are_not_stored_plaintext(self):
        user_id = self.register(' User@Example.com ')
        self.assertEqual(self.store.login('user@example.com', 'a-long-test-password'), user_id)
        token, user = self.store.issue_session(user_id)
        with self.store.db() as db:
            record = db.execute('SELECT * FROM users').fetchone()
            self.assertTrue(record['password_hash'].startswith('pbkdf2_sha256$600000$'))
            self.assertNotIn('a-long-test-password', record['password_hash'])
            self.assertEqual(db.execute('SELECT token_hash FROM sessions').fetchone()[0], digest(token))
        self.assertNotIn('password_hash', user)
        with self.assertRaises(AuthError): self.store.login('user@example.com', 'wrong-password')
        with self.assertRaises(AuthError): self.store.login('missing@example.com', 'wrong-password')

    def test_public_registration_cannot_request_admin(self):
        result = self.send('/api/auth/register', 'POST', data={'email':'user@example.com','name':'User','password':'a-long-test-password','role':'admin'})
        self.assertEqual(result.status, 200)
        self.assertEqual(result.result['user']['role'], 'user')
        cookies = [value for key, value in result.response_headers if key == 'Set-Cookie']
        self.assertTrue(any('HttpOnly' in value and 'SameSite=Lax' in value and value.startswith(COOKIE) for value in cookies))
        self.assertTrue(all('a-long-test-password' not in value for value in cookies))
        self.assertIn('Secure', AuthHTTP(self.store, origin='https://example.com').cookie(COOKIE, 'x'))

    def test_admin_api_requires_server_verified_role(self):
        self.assertEqual(self.send('/api/admin/users').status, 401)
        user_id = self.register()
        token, _ = self.store.issue_session(user_id)
        self.assertEqual(self.send('/api/admin/users', token=token).status, 403)
        self.store.promote('user@example.com')
        result = self.send('/api/admin/users', token=token)
        self.assertEqual(result.status, 200)
        self.assertEqual(result.result['total_users'], 1)
        self.assertNotIn('password_hash', json.dumps(result.result))
        self.assertNotIn(token, json.dumps(result.result))

    def test_rotation_logout_idle_and_absolute_expiry(self):
        user_id = self.register()
        old, _ = self.store.issue_session(user_id)
        token, _ = self.store.issue_session(user_id, old)
        with self.assertRaises(AuthError): self.store.authenticate(old)
        self.assertEqual(self.store.authenticate(token)['id'], user_id)
        self.store.logout(token)
        with self.assertRaises(AuthError): self.store.authenticate(token)
        token, _ = self.store.issue_session(user_id)
        self.now += IDLE_SECONDS + 1
        with self.assertRaises(AuthError): self.store.authenticate(token)
        token, _ = self.store.issue_session(user_id)
        for _ in range(49):
            self.now += 900
            try: self.store.authenticate(token, touch=True)
            except AuthError: break
        with self.assertRaises(AuthError): self.store.authenticate(token)

    def test_mutations_reject_foreign_origin_and_simple_requests(self):
        for origin, content_type in [('https://evil.example','application/json'), (None,'application/json'), ('http://localhost:5173','text/plain')]:
            result = self.send('/api/auth/register', 'POST', data={'email':'user@example.com','password':'a-long-test-password','name':'User'}, origin=origin, content_type=content_type)
            self.assertIn(result.status, (403, 415))
        self.assertEqual(self.store.admin_report()['total_users'], 0)

    def test_activity_counts_unique_users_not_tabs(self):
        first, second = self.register(), self.register('second@example.com')
        one, _ = self.store.issue_session(first)
        self.store.issue_session(first)
        two, _ = self.store.issue_session(second)
        report = self.store.admin_report()
        self.assertEqual((report['total_users'],report['active_now'],report['active_24h'],report['total_logins']), (2,2,2,3))
        self.assertEqual(report['trend'][-1]['users'], 2)
        self.now += 301
        self.assertEqual(self.store.admin_report()['active_now'], 0)
        self.store.authenticate(one, touch=True)
        self.assertEqual(self.store.admin_report()['active_now'], 1)
        self.store.logout(one)
        self.assertEqual(self.store.admin_report()['active_now'], 0)

    def test_limiter_expires_and_invalid_inputs_are_rejected(self):
        for _ in range(10): self.store.throttle('user@example.com','127.0.0.1')
        with self.assertRaises(AuthError) as error: self.store.throttle('user@example.com','127.0.0.1')
        self.assertEqual(error.exception.status, 429)
        self.now += 901
        self.store.throttle('user@example.com','127.0.0.1')
        for email, password in [('invalid','long-enough-password'), ('a@example.com','short')]:
            with self.assertRaises(AuthError): self.store.register(email,password,'User')

    def test_google_nonce_verification_and_no_implicit_account_linking(self):
        self.register()
        claims={'sub':'google-sub','email':'google@example.com','email_verified':True,'name':'Google user'}
        nonce=self.store.nonce();claims['nonce']=nonce
        with patch('google.oauth2.id_token.verify_oauth2_token', return_value=claims) as verify:
            user_id=self.store.google_login('signed-token',nonce)
            self.assertEqual(verify.call_args.args[2], 'test-client')
            self.assertEqual(self.store.issue_session(user_id)[1]['provider'],'google')
            with self.assertRaises(AuthError): self.store.google_login('signed-token',nonce)
        for changes in [{'nonce':'wrong'}, {'email_verified':False}, {'sub':'another-sub','email':'user@example.com'}]:
            nonce=self.store.nonce()
            with patch('google.oauth2.id_token.verify_oauth2_token',return_value={**claims,'nonce':nonce,**changes}):
                with self.assertRaises(AuthError): self.store.google_login('signed-token',nonce)
        nonce=self.store.nonce()
        with patch('google.oauth2.id_token.verify_oauth2_token',side_effect=ValueError('bad signature')):
            with self.assertRaises(AuthError): self.store.google_login('forged-token',nonce)

    def test_google_cookies_do_not_hide_auth_session(self):
        nonce = self.store.nonce()
        claims = {'sub': 'google-cookie-user', 'email': 'google@example.com',
                  'email_verified': True, 'name': 'Google user', 'nonce': nonce}
        request = Request('/api/auth/google', 'POST', data={'credential': 'signed-token'})
        request.headers.replace_header('Cookie', f'g_state={{"i_l":0}}; {NONCE_COOKIE}={nonce}')
        with patch('google.oauth2.id_token.verify_oauth2_token', return_value=claims):
            self.http.handle(request)
        self.assertEqual(request.status, 200)
        session = next(value.split(';')[0] for key, value in request.response_headers
                       if key == 'Set-Cookie' and value.startswith(COOKIE + '='))
        for cookies in [f'g_state={{"i_l":0}}; {session}', f'{session}; g_state={{"i_l":0}}']:
            request = Request('/api/auth/me')
            request.headers.replace_header('Cookie', cookies)
            self.http.handle(request)
            self.assertEqual(request.status, 200)
            self.assertEqual(request.result['user']['email'], 'google@example.com')
        request = Request('/api/auth/me')
        request.headers.replace_header('Cookie', f'{session}; {COOKIE}=ambiguous')
        self.http.handle(request)
        self.assertEqual(request.status, 401)

    def test_protected_scanner_requests_require_authentication(self):
        request=Request('/api/auto-detect','POST')
        self.assertIsNone(self.http.protect(request))
        self.assertEqual(request.status,401)
        token,_=self.store.issue_session(self.register())
        request=Request('/api/train','POST',token=token)
        self.assertIsNone(self.http.protect(request,admin=True))
        self.assertEqual(request.status,403)


if __name__ == '__main__': unittest.main()
