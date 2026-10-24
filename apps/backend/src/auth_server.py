"""Small account-only server for tests or working without the ML scanner."""
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
from auth import auth_http


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not auth_http().handle(self):
            auth_http().send(self, 404, {'error': 'The scanner is unavailable on this account-only server.'})

    do_POST = do_GET


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=5050)
    args = parser.parse_args()
    auth_http()
    server = HTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Account server running on http://127.0.0.1:{args.port}', flush=True)
    server.serve_forever()
