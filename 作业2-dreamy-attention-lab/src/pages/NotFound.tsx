import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="completion-wrap">
      <div className="completion-hero">
        <span className="eyebrow">404 · Drifted off course</span>
        <h1 className="completion-title" style={{ marginTop: 16 }}>
          这个页面不在地图上
        </h1>
        <p className="completion-lede">
          链接可能已经移动，或输入了一个不存在的地址。
        </p>
        <div className="completion-actions">
          <Link to="/" className="btn btn--primary">
            <ArrowLeft size={15} strokeWidth={1.7} />
            回到首页
          </Link>
          <Link to="/experiments" className="btn btn--soft">
            查看实验目录
          </Link>
        </div>
      </div>
    </div>
  );
}
