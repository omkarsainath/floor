"""Persistent accounts and revocable sessions. No ML dependencies required."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / '.env')
except ImportError:
    pass

COOKIE = 'ai3d_session'
NONCE_COOKIE = 'ai3d_google_nonce'
SESSION_SECONDS = 12 * 60 * 60
IDLE_SECONDS = 30 * 60
ITERATIONS = 600_000


class AuthError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def normalize_email(value):
    if not isinstance(value, str) or len(value) > 254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value.strip()):
        raise AuthError(400, 'Enter a valid email address.')
    return value.strip().lower()


def password_hash(password):
    if not isinstance(password, str) or not 12 <= len(password) <= 128:
        raise AuthError(400, 'Use a password between 12 and 128 characters.')
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), ITERATIONS)
    return f'pbkdf2_sha256${ITERATIONS}${salt}${key.hex()}'


def check_password(password, encoded):
    if not isinstance(password, str) or len(password) > 128:
        return False
    algorithm, iterations, salt, expected = encoded.split('$')
    if algorithm != 'pbkdf2_sha256':
        return False
    actual = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(iterations)).hex()
    return hmac.compare_digest(actual, expected)


def public_user(row):
    return {key: row[key] for key in ('id', 'email', 'name', 'role', 'provider', 'created_at', 'last_seen', 'login_count')}


class AuthStore:
    def __init__(self, path=None, clock=time.time, google_client_id=None):
        self.path = str(path or os.environ.get('AUTH_DB_PATH') or Path(__file__).resolve().parents[1] / 'private' / 'accounts.sqlite3')
        self.clock = clock
        self.google_client_id = google_client_id if google_client_id is not None else os.environ.get('GOOGLE_CLIENT_ID', '')
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.dummy_hash = password_hash(secrets.token_urlsafe(32))
        with self.db() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
                    password_hash TEXT, google_sub TEXT UNIQUE,
                    role TEXT NOT NULL CHECK(role IN ('user','admin')),
                    provider TEXT NOT NULL, created_at INTEGER NOT NULL,
                    last_seen INTEGER, login_count INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
                    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS session_user ON sessions(user_id);
                CREATE TABLE IF NOT EXISTS daily_activity (
                    day TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(day,user_id)
                );
                CREATE TABLE IF NOT EXISTS attempts (bucket TEXT NOT NULL, at INTEGER NOT NULL);
                CREATE INDEX IF NOT EXISTS attempts_bucket ON attempts(bucket,at);
                CREATE TABLE IF NOT EXISTS google_nonces (hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
            ''')
        os.chmod(self.path, 0o600)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    def throttle(self, email, remote):
        now = int(self.clock())
        with self.db() as db:
            db.execute('DELETE FROM attempts WHERE at < ?', (now - 900,))
            buckets = [(f'email:{digest(email)}', 10), (f'ip:{digest(remote)}', 60)]
            for bucket, limit in buckets:
                count = db.execute('SELECT count(*) FROM attempts WHERE bucket=?', (bucket,)).fetchone()[0]
                if count >= limit:
                    raise AuthError(429, 'Too many sign-in attempts. Please try again in 15 minutes.')
            db.executemany('INSERT INTO attempts VALUES (?,?)', [(bucket, now) for bucket, _ in buckets])

    def register(self, email, password, name):
        email = normalize_email(email)
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 100:
            raise AuthError(400, 'Enter your name (up to 100 characters).')
        encoded = password_hash(password)
        user_id = secrets.token_hex(16)
        try:
            with self.db() as db:
                db.execute('INSERT INTO users(id,email,name,password_hash,role,provider,created_at) VALUES (?,?,?,?,?,?,?)',
                           (user_id, email, name.strip(), encoded, 'user', 'password', int(self.clock())))
        except sqlite3.IntegrityError:
            raise AuthError(409, 'Could not create this account. Try signing in or use another email.')
        return user_id

    def login(self, email, password):
        email = normalize_email(email)
        with self.db() as db:
            user = db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
        valid = check_password(password, user['password_hash'] if user and user['password_hash'] else self.dummy_hash)
        if not user or not user['password_hash'] or not valid:
            raise AuthError(401, 'Incorrect email or password.')
        return user['id']

    def promote(self, email):
        """Only called by the trusted local administrator CLI, never by an API."""
        with self.db() as db:
            result = db.execute("UPDATE users SET role='admin' WHERE email=?", (normalize_email(email),))
            if not result.rowcount:
                raise AuthError(404, 'Create this account first, then promote it.')

    def nonce(self):
        value = secrets.token_urlsafe(32)
        with self.db() as db:
            db.execute('DELETE FROM google_nonces WHERE expires_at <= ?', (int(self.clock()),))
            db.execute('INSERT INTO google_nonces VALUES (?,?)', (digest(value), int(self.clock()) + 300))
        return value

    def google_login(self, credential, nonce):
        if not self.google_client_id:
            raise AuthError(503, 'Google sign-in has not been configured yet.')
        if not isinstance(credential, str) or not credential or len(credential) > 16000 or not nonce:
            raise AuthError(400, 'Restart Google sign-in and try again.')
        with self.db() as db:
            found = db.execute('SELECT * FROM google_nonces WHERE hash=? AND expires_at>?', (digest(nonce), int(self.clock()))).fetchone()
            if not found:
                raise AuthError(401, 'Google sign-in expired. Please try again.')
            db.execute('DELETE FROM google_nonces WHERE hash=?', (digest(nonce),))
        try:
            from google.oauth2 import id_token
            from google.auth.transport.requests import Request
            import requests
            class TimedRequest(Request):
                def __call__(self, *args, **kwargs):
                    kwargs['timeout'] = 10
                    return super().__call__(*args, **kwargs)
            with requests.Session() as session:
                claims = id_token.verify_oauth2_token(credential, TimedRequest(session=session), self.google_client_id)
        except ImportError:
            raise AuthError(503, 'Google sign-in dependencies are not installed on the server.')
        except Exception:
            raise AuthError(401, 'Could not verify Google sign-in. Please try again.')
        if not hmac.compare_digest(str(claims.get('nonce', '')), nonce) or claims.get('email_verified') is not True or not isinstance(claims.get('sub'), str) or not claims['sub']:
            raise AuthError(401, 'Could not verify Google sign-in. Please try again.')
        email = normalize_email(claims.get('email'))
        with self.db() as db:
            user = db.execute('SELECT * FROM users WHERE google_sub=?', (claims['sub'],)).fetchone()
            if user:
                return user['id']
            # Do not silently link a password account based on a matching email.
            if db.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone():
                raise AuthError(409, 'This email already has an account. Sign in with its password.')
            user_id = secrets.token_hex(16)
            db.execute('INSERT INTO users(id,email,name,google_sub,role,provider,created_at) VALUES (?,?,?,?,?,?,?)',
                       (user_id, email, str(claims.get('name') or email).strip()[:100], claims['sub'], 'user', 'google', int(self.clock())))
        return user_id

    def issue_session(self, user_id, previous=None):
        token = secrets.token_urlsafe(32)
        now = int(self.clock())
        with self.db() as db:
            db.execute('DELETE FROM sessions WHERE expires_at<=? OR last_seen<=?', (now, now - IDLE_SECONDS))
            if previous:
                db.execute('DELETE FROM sessions WHERE token_hash=?', (digest(previous),))
            db.execute('INSERT INTO sessions VALUES (?,?,?,?,?)', (digest(token), user_id, now, now + SESSION_SECONDS, now))
            db.execute('UPDATE users SET login_count=login_count+1, last_seen=? WHERE id=?', (now, user_id))
            self._activity(db, user_id, now)
            user = db.execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone()
        return token, public_user(user)

    def _activity(self, db, user_id, now):
        day = datetime.fromtimestamp(now, timezone.utc).strftime('%Y-%m-%d')
        db.execute('INSERT OR IGNORE INTO daily_activity VALUES (?,?)', (day, user_id))

    def authenticate(self, token, touch=False):
        if not token:
            raise AuthError(401, 'Please sign in to continue.')
        now = int(self.clock())
        with self.db() as db:
            row = db.execute('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>? AND sessions.last_seen>?',
                             (digest(token), now, now - IDLE_SECONDS)).fetchone()
            if not row:
                raise AuthError(401, 'Your session has expired. Please sign in again.')
            if touch:
                db.execute('UPDATE sessions SET last_seen=? WHERE token_hash=?', (now, digest(token)))
                db.execute('UPDATE users SET last_seen=? WHERE id=?', (now, row['id']))
                self._activity(db, row['id'], now)
        result = public_user(row)
        if touch:
            result['last_seen'] = now
        return result

    def logout(self, token):
        if token:
            with self.db() as db:
                db.execute('DELETE FROM sessions WHERE token_hash=?', (digest(token),))

    def admin_report(self, page=1):
        now = int(self.clock())
        page = max(1, min(page, 1000000))
        with self.db() as db:
            total = db.execute('SELECT count(*) FROM users').fetchone()[0]
            online = db.execute('SELECT count(DISTINCT user_id) FROM sessions WHERE last_seen>? AND expires_at>?', (now-300, now)).fetchone()[0]
            recent = db.execute('SELECT count(*) FROM users WHERE last_seen>=?', (now-86400,)).fetchone()[0]
            logins = db.execute('SELECT coalesce(sum(login_count),0) FROM users').fetchone()[0]
            users = db.execute('SELECT users.*, EXISTS(SELECT 1 FROM sessions WHERE user_id=users.id AND last_seen>? AND expires_at>?) AS online FROM users ORDER BY created_at DESC,id LIMIT 50 OFFSET ?',
                               (now-300, now, (page-1)*50)).fetchall()
            since = datetime.fromtimestamp(now-6*86400, timezone.utc).strftime('%Y-%m-%d')
            activity = dict(db.execute('SELECT day,count(*) FROM daily_activity WHERE day>=? GROUP BY day', (since,)).fetchall())
        trend = []
        for offset in range(6,-1,-1):
            day = datetime.fromtimestamp(now-offset*86400, timezone.utc).strftime('%Y-%m-%d')
            trend.append({'day': day, 'users': activity.get(day, 0)})
        return {'total_users': total, 'active_now': online, 'active_24h': recent, 'total_logins': logins,
                'users': [{**public_user(user), 'online': bool(user['online'])} for user in users],
                'trend': trend, 'page': page, 'page_size': 50, 'generated_at': now}


class AuthHTTP:
    def __init__(self, store=None, origin=None):
        self.store = store or AuthStore()
        self.origin = (origin or os.environ.get('APP_ORIGIN', 'http://localhost:5173')).rstrip('/')
        self.secure = self.origin.startswith('https://')

    def cookie(self, name, value, clear=False):
        result = f'{name}={value}; Path=/; HttpOnly; SameSite=Lax'
        if self.secure:
            result += '; Secure'
        if clear:
            result += '; Max-Age=0'
        return result

    @staticmethod
    def cookies(handler):
        # GIS sets a JSON-valued g_state cookie. Parsing the whole header with
        # SimpleCookie can silently discard our cookies after that value.
        cookies = {}
        seen = set()
        for header in handler.headers.get_all('Cookie', []):
            for part in header.split(';'):
                name, separator, value = part.strip().partition('=')
                if name not in (COOKIE, NONCE_COOKIE):
                    continue
                if name in seen:
                    return {}  # Reject ambiguous authentication cookies.
                seen.add(name)
                if separator and re.fullmatch(r'[A-Za-z0-9_-]{43}', value):
                    cookies[name] = value
        return cookies

    @staticmethod
    def send(handler, status, payload, cookies=()):
        body = json.dumps(payload).encode()
        handler.send_response(status)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Content-Length', str(len(body)))
        handler.send_header('Cache-Control', 'no-store')
        handler.send_header('X-Content-Type-Options', 'nosniff')
        for cookie in cookies:
            handler.send_header('Set-Cookie', cookie)
        handler.end_headers()
        handler.wfile.write(body)

    def check_origin(self, handler):
        if handler.headers.get('Origin') != self.origin:
            raise AuthError(403, 'This request came from an untrusted origin.')
        if handler.headers.get('Content-Type', '').split(';')[0].lower() != 'application/json':
            raise AuthError(415, 'Send a JSON request.')

    def require_user(self, handler, admin=False):
        user = self.store.authenticate(self.cookies(handler).get(COOKIE))
        if admin and user['role'] != 'admin':
            raise AuthError(403, 'Administrator access required.')
        return user

    def protect(self, handler, admin=False):
        try:
            if handler.command != 'GET':
                self.check_origin(handler)
            return self.require_user(handler, admin)
        except AuthError as error:
            self.send(handler, error.status, {'error': str(error)})
            return None
        except (sqlite3.Error, OSError):
            self.send(handler, 503, {'error': 'Account storage is unavailable.'})
            return None

    def handle(self, handler):
        path = urlsplit(handler.path).path
        if not (path.startswith('/api/auth/') or path.startswith('/api/admin/')):
            return False
        try:
            self._handle(handler, path)
        except AuthError as error:
            self.send(handler, error.status, {'error': str(error)})
        except (sqlite3.Error, OSError):
            self.send(handler, 503, {'error': 'Account storage is unavailable. Please try again later.'})
        return True

    def _handle(self, handler, path):
        cookies = self.cookies(handler)
        if handler.command == 'GET':
            if path == '/api/auth/config':
                self.send(handler, 200, {'google_client_id': self.store.google_client_id})
            elif path == '/api/auth/me':
                self.send(handler, 200, {'user': self.require_user(handler)})
            elif path == '/api/admin/users':
                self.require_user(handler, admin=True)
                try:
                    page = int(parse_qs(urlsplit(handler.path).query).get('page', ['1'])[0])
                except ValueError:
                    raise AuthError(400, 'Invalid page number.')
                self.send(handler, 200, self.store.admin_report(page))
            else:
                raise AuthError(404, 'Unknown endpoint.')
            return
        if handler.command != 'POST':
            raise AuthError(405, 'Method not allowed.')
        self.check_origin(handler)
        try:
            length = int(handler.headers.get('Content-Length', '0'))
            if not 0 <= length <= 20000:
                raise AuthError(413, 'Request is too large.')
            data = json.loads(handler.rfile.read(length) or b'{}')
            if not isinstance(data, dict):
                raise ValueError()
        except (ValueError, UnicodeError):
            raise AuthError(400, 'Send a valid JSON object.')
        if path == '/api/auth/logout':
            self.store.logout(cookies.get(COOKIE))
            self.send(handler, 200, {'ok': True}, [self.cookie(COOKIE, '', clear=True)])
            return
        if path == '/api/auth/heartbeat':
            self.send(handler, 200, {'user': self.store.authenticate(cookies.get(COOKIE), touch=True)})
            return
        if path == '/api/auth/google-nonce':
            self.store.throttle('google-nonce', handler.client_address[0])
            nonce = self.store.nonce()
            self.send(handler, 200, {'nonce': nonce}, [self.cookie(NONCE_COOKIE, nonce)])
            return
        if path not in ('/api/auth/login', '/api/auth/register', '/api/auth/google'):
            raise AuthError(404, 'Unknown endpoint.')
        email = normalize_email(data.get('email')) if path != '/api/auth/google' else 'google'
        self.store.throttle(email, handler.client_address[0])
        if path == '/api/auth/login':
            user_id = self.store.login(email, data.get('password'))
        elif path == '/api/auth/register':
            user_id = self.store.register(email, data.get('password'), data.get('name'))
        else:
            user_id = self.store.google_login(data.get('credential'), cookies.get(NONCE_COOKIE))
        token, user = self.store.issue_session(user_id, cookies.get(COOKIE))
        self.send(handler, 200, {'user': user}, [self.cookie(COOKIE, token), self.cookie(NONCE_COOKIE, '', clear=True)])


_http = None


def auth_http():
    global _http
    if _http is None:
        _http = AuthHTTP()
    return _http
