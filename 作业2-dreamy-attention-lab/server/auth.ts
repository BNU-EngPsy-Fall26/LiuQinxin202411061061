import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const RESEARCHER_COOKIE = 'dcl_researcher';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 10;

interface TokenPayload {
  sub: 'researcher';
  exp: number;
}

export interface AuthConfig {
  username: string;
  password: string;
  secret: string;
  secureCookie: boolean;
}

function timingSafeEqualText(a: string, b: string): boolean {
  const left = crypto.createHash('sha256').update(a).digest();
  const right = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

function sign(payloadPart: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payloadPart)
    .digest('base64url');
}

export function loadAuthConfig(dataDir: string): AuthConfig {
  const production = process.env.NODE_ENV === 'production';
  const password = process.env.RESEARCHER_PASSWORD ?? (production ? '' : 'dreamlab');
  if (!password) {
    throw new Error(
      'RESEARCHER_PASSWORD 未设置。生产环境必须设置研究者管理密码。',
    );
  }
  if (password.length < 8) {
    throw new Error('RESEARCHER_PASSWORD 至少需要 8 个字符。');
  }

  let secret = process.env.AUTH_SECRET ?? '';
  if (!secret) {
    const secretPath = path.join(dataDir, '.auth-secret');
    fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(secretPath)) {
      secret = fs.readFileSync(secretPath, 'utf8').trim();
    } else {
      secret = crypto.randomBytes(48).toString('base64url');
      fs.writeFileSync(secretPath, secret, { mode: 0o600 });
    }
  }
  if (secret.length < 24) {
    throw new Error('AUTH_SECRET 至少需要 24 个字符。');
  }

  return {
    username: process.env.RESEARCHER_USERNAME ?? 'researcher',
    password,
    secret,
    secureCookie: production,
  };
}

export function verifyCredentials(
  auth: AuthConfig,
  username: string,
  password: string,
): boolean {
  return (
    timingSafeEqualText(username.trim(), auth.username) &&
    timingSafeEqualText(password, auth.password)
  );
}

export function issueResearcherToken(auth: AuthConfig): string {
  const payload: TokenPayload = {
    sub: 'researcher',
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, auth.secret)}`;
}

export function tokenIsValid(auth: AuthConfig, token: string | undefined): boolean {
  if (!token) return false;
  const [body, signature] = token.split('.');
  if (!body || !signature) return false;
  const expected = sign(body, auth.secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return false;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as TokenPayload;
    return payload.sub === 'researcher' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function researcherCookie(auth: AuthConfig, token: string): string {
  const flags = [
    `${RESEARCHER_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}`,
  ];
  if (auth.secureCookie) flags.push('Secure');
  return flags.join('; ');
}

export function clearResearcherCookie(auth: AuthConfig): string {
  const flags = [
    `${RESEARCHER_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (auth.secureCookie) flags.push('Secure');
  return flags.join('; ');
}
