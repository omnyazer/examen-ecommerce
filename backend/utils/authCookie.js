const COOKIE_NAME = 'session';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

function readToken(req) {
  const cookie = (req.headers.cookie || '')
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1));
  } catch {
    return null;
  }
}

module.exports = { COOKIE_NAME, cookieOptions, readToken };
