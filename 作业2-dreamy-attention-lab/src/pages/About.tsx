import { Link } from 'react-router-dom';
import {
  Activity,
  Compass,
  Eye,
  FileCheck2,
  Microscope,
  ShieldCheck,
} from 'lucide-react';
import { PageHero } from '@/components/ui/PageHero';

export function AboutPage() {
  const contactEmail = import.meta.env.VITE_LAB_CONTACT_EMAIL?.trim();

  return (
    <>
      <PageHero
        eyebrow="About the lab"
        title="关于实验室"
        english="Method before decoration"
        breadcrumb={[
          { label: '首页', to: '/' },
          { label: '关于实验室' },
        ]}
        aside="梦境注意实验室是一个面向在线注意与行为实验的开放平台。我们把科学效度放在视觉表达之前：装饰可以安静，刺激与计时必须严谨。"
      />

      <section className="section-sm">
        <div className="principles" style={{ marginTop: 0 }}>
          <div className="principle">
            <Microscope size={20} strokeWidth={1.4} />
            <strong>范式优先</strong>
            <span>
              刺激尺寸、颜色、位置与呈现时间由实验配置集中管理。装饰性元素不会进入正式刺激区域，也不会改变试次时序。
            </span>
          </div>
          <div className="principle">
            <Activity size={20} strokeWidth={1.4} />
            <strong>单调计时</strong>
            <span>
              所有反应时使用 <code>performance.now()</code> 计算。刺激起点在双帧绘制回调后标记，并如实记录浏览器计时的局限。
            </span>
          </div>
          <div className="principle">
            <Eye size={20} strokeWidth={1.4} />
            <strong>双轨测量，不混为一谈</strong>
            <span>
              视觉搜索同时记录鼠标轨迹与可选的 WebGazer 注视估计，两者分别分析；所有字段都标注测量方式，鼠标数据不会被称作眼动。
            </span>
          </div>
          <div className="principle">
            <FileCheck2 size={20} strokeWidth={1.4} />
            <strong>原始数据可追溯</strong>
            <span>
              每个试次保存条件、刺激参数、按键、反应时、时间戳与配置版本快照。研究者修改配置只影响之后的新会话。
            </span>
          </div>
        </div>
      </section>

      <section className="section-sm">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.15fr) minmax(280px, .85fr)',
            gap: 32,
            alignItems: 'start',
          }}
          className="about-grid"
        >
          <div>
            <span className="eyebrow">Research protocol</span>
            <h2 className="section-title" style={{ fontSize: 34, marginTop: 16 }}>
              在线实验能做什么，不能做什么
            </h2>
            <p className="section-lede">
              浏览器可以可靠记录按键、鼠标操作、试次顺序与相对时间，适合研究许多注意、知觉与空间认知问题。
              但它不是眼动仪，也不是经过光电二极管校准的刺激呈现系统。平台不会把浏览器数据包装成实验室级测量。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 22 }}>
              <div className="notice" id="timing">
                <strong>呈现时间：</strong>
                反应时以刺激绘制后的单调时间戳为起点；不同设备、刷新率与浏览器合成路径会造成数毫秒到数十毫秒的误差。
                需要精确到单帧的研究应使用实验室设备，并将本项目视为行为数据采集平台。
              </div>
              <div className="notice notice--lilac">
                <strong>眼动：</strong>
                视觉搜索提供可选的 WebGazer 摄像头注视估计。它受光照、设备与注视估计误差影响很大，
                精度远低于专业眼动仪，只作探索性参考。拒绝摄像头不会影响实验；原始视频不上传，
                且不会把鼠标轨迹或眼动估计描述成“真实扫描轨迹”。
              </div>
              <div className="notice notice--mint">
                <strong>有效性元数据：</strong>
                页面隐藏、窗口失焦、超时、无效按键与设备环境会随试次记录，供研究者排除低质量试次，
                而不是在客户端悄悄删除。
              </div>
            </div>
          </div>

          <aside className="side-card" id="data">
            <div className="side-card__title">What is recorded</div>
            <div className="fact-list">
              <div className="fact">
                <span>身份</span>
                <strong>匿名被试编号</strong>
              </div>
              <div className="fact">
                <span>试次级</span>
                <strong>条件 · 刺激 · 反应 · RT</strong>
              </div>
              <div className="fact">
                <span>过程</span>
                <strong>鼠标轨迹 · 排序操作</strong>
              </div>
              <div className="fact">
                <span>有效性</span>
                <strong>超时 · 失焦 · 页面隐藏</strong>
              </div>
              <div className="fact">
                <span>环境</span>
                <strong>浏览器 · 视口 · 时区</strong>
              </div>
              <div className="fact">
                <span>配置</span>
                <strong>版本号 + 快照</strong>
              </div>
            </div>
            <hr className="hairline" style={{ margin: '18px 0' }} />
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                color: 'var(--muted)',
                fontSize: 11,
                lineHeight: 1.8,
              }}
            >
              <ShieldCheck size={14} strokeWidth={1.5} style={{ flex: 'none', marginTop: 2 }} />
              不收集姓名、电话、邮箱、精确位置或原始摄像头画面。研究者入口与参与者入口分离，并要求独立登录。
            </div>
          </aside>
        </div>
      </section>

      <section className="section-sm">
        <div className="form-card" style={{ padding: 'clamp(24px, 5vw, 46px)' }}>
          <span className="eyebrow">Design position</span>
          <h2 className="section-title" style={{ fontSize: 32, marginTop: 16 }}>
            一间漂浮在云端的实验室
          </h2>
          <p className="section-lede" style={{ marginTop: 12 }}>
            非实验页面使用雾蓝、淡紫、薄荷与珍珠白的光层、缓慢漂移和克制的玻璃质感，
            让参与者在进入任务前感到安静。正式实验区域则切换为中性浅背景、固定尺寸刺激区域和最少文本：
            没有渐变背景、漂浮装饰、闪烁、无关动画或干扰性弹窗。
          </p>
          <p className="section-lede" style={{ marginTop: 12 }}>
            这不是两套割裂的界面，而是同一条原则的两端：环境可以梦幻，测量必须清醒。
            当视觉优化与实验效度冲突时，放弃视觉优化。
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
            <Link to="/experiments" className="btn btn--primary">
              <Compass size={15} strokeWidth={1.7} />
              浏览实验
            </Link>
            <Link to="/researcher/login" className="btn btn--soft">
              研究者入口
            </Link>
          </div>
        </div>
      </section>

      <section className="section-sm" id="contact">
        <div className="form-card" style={{ padding: 'clamp(24px, 5vw, 46px)' }}>
          <span className="eyebrow">Contact & withdrawal</span>
          <h2 className="section-title" style={{ fontSize: 32, marginTop: 16 }}>
            联系与数据撤回
          </h2>
          <p className="section-lede" style={{ marginTop: 12 }}>
            如需撤回数据、报告技术问题或询问研究用途，请使用邀请你参与实验的研究者或实验室提供的联系方式，
            并提供你的匿名被试编号。平台不要求你提供姓名、电话或邮箱。
          </p>
          {contactEmail ? (
            <p className="section-lede" style={{ marginTop: 12 }}>
              本部署的联系邮箱：
              <a href={`mailto:${contactEmail}`} style={{ color: 'var(--ink)' }}>
                {contactEmail}
              </a>
            </p>
          ) : (
            <p className="field-hint" style={{ marginTop: 12 }}>
              本部署尚未配置公开联系邮箱。请联系招募信息中列出的研究者或实验室管理员。
            </p>
          )}
          <p className="field-hint" style={{ marginTop: 12 }}>
            研究数据按匿名编号保存；研究者只能通过编号定位数据，无法从平台数据中还原你的真实身份。
          </p>
        </div>
      </section>
    </>
  );
}
