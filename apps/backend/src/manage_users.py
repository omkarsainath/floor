"""Create or promote an administrator from the trusted server terminal."""
import argparse
import getpass
from auth import AuthStore, AuthError


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--email', help='Administrator email')
    parser.add_argument('--promote', action='store_true', help='Promote an existing account, including a Google account')
    args = parser.parse_args()
    store = AuthStore()
    try:
        email = args.email or input('Administrator email: ').strip()
        if not args.promote:
            name = input('Name: ').strip()
            password = getpass.getpass('Password (12–128 characters): ')
            if password != getpass.getpass('Confirm password: '):
                raise AuthError(400, 'Passwords do not match.')
            store.register(email, password, name)
        store.promote(email)
        print('Administrator ready. Sign in at http://localhost:5173/login.html, then open Admin.')
    except AuthError as error:
        parser.exit(1, f'{error}\n')


if __name__ == '__main__':
    main()
