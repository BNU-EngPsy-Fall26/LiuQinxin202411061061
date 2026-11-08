import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';

export function SiteFooter() {
  const contactEmail = import.meta.env.VITE_LAB_CONTACT_EMAIL?.trim();

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-brand">
            <Logo />
            <p>
              一个以科学严谨性为前提、以空灵视觉语言为表达的在线认知心理学实验平台。
              所有实验刺激由程序生成，试次级数据统一记录。
            </p>
          </div>
          <div className="footer-cols">
            <div className="footer-col">
              <span className="label-caps">Experiments</span>
              <Link to="/enter/visual-search">视觉搜索</Link>
              <Link to="/enter/map-alignment">地图对齐</Link>
            </div>
            <div className="footer-col">
              <span className="label-caps">Platform</span>
              <Link to="/experiments">实验目录</Link>
              <Link to="/about">平台与方法</Link>
              {contactEmail ? (
                <a href={`mailto:${contactEmail}`}>联系实验室</a>
              ) : (
                <Link to="/about#contact">联系与数据撤回</Link>
              )}
            </div>
            <div className="footer-col">
              <span className="label-caps">Research</span>
              <Link to="/researcher/login">研究者管理</Link>
              <Link to="/about#data">数据与伦理</Link>
              <Link to="/about#timing">时间精度说明</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} Dreamy Attention Lab · 梦境注意实验室
          </span>
          <span>
            Built for careful looking
            <span className="dot">·</span>
            Browser timing is not photodiode-verified
            <span className="dot">·</span>
            字体与图标授权见 ASSET_LICENSES.md
          </span>
        </div>
      </div>
    </footer>
  );
}
