import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, LoaderCircle, LockKeyhole } from 'lucide-react';
import { BrandMark } from '@/components/brand/Logo';
import { api, ApiError } from '@/services/api';

export function ResearcherLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api
      .researcherMe()
      .then((me) => {
        if (active && me.authenticated) navigate('/researcher', { replace: true });
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('请输入研究者账号与密码。');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.login(username.trim(), password);
      navigate('/researcher', { replace: true });
    } catch (loginError) {
      if (loginError instanceof ApiError) {
        setError(loginError.message);
      } else {
        setError('登录失败，请检查网络后重试。');
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <BrandMark />
        <span className="eyebrow" style={{ display: 'block', marginTop: 22 }}>
          Researcher access
        </span>
        <h1>研究者入口</h1>
        <p>
          此入口用于查看实验配置、被试完成状态、逐试次数据与导出文件。
          参与者不需要登录，也无法访问本页。
        </p>

        {checking ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '34px 0 12px' }}>
            <LoaderCircle className="spinner" size={22} />
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} style={{ marginTop: 24 }}>
            <div className="config-field" style={{ marginBottom: 14 }}>
              <label htmlFor="researcher-username">账号</label>
              <input
                id="researcher-username"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setError('');
                }}
                autoComplete="username"
                spellCheck={false}
                disabled={submitting}
              />
            </div>
            <div className="config-field">
              <label htmlFor="researcher-password">密码</label>
              <input
                id="researcher-password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError('');
                }}
                autoComplete="current-password"
                disabled={submitting}
              />
            </div>
            {error && (
              <div className="config-error" role="alert" style={{ marginTop: 14 }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              className="btn btn--primary"
              style={{ width: '100%', marginTop: 20 }}
              disabled={submitting}
            >
              {submitting ? (
                <LoaderCircle size={15} className="spinner" />
              ) : (
                <KeyRound size={15} strokeWidth={1.7} />
              )}
              {submitting ? '正在验证…' : '登录研究者后台'}
            </button>
          </form>
        )}

        <div
          style={{
            marginTop: 22,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            color: 'var(--muted-light)',
            fontSize: 10.5,
            lineHeight: 1.7,
          }}
        >
          <LockKeyhole size={13} strokeWidth={1.6} style={{ flex: 'none', marginTop: 2 }} />
          <span>
            身份由服务端签名的 HttpOnly Cookie 维持，登录有频率限制。
            首次部署时请在环境变量中设置研究者账号与强密码。
          </span>
        </div>

        <Link
          to="/"
          className="link-arrow"
          style={{ display: 'inline-flex', marginTop: 22, fontSize: 11 }}
        >
          返回参与者首页
        </Link>
      </div>
    </div>
  );
}
