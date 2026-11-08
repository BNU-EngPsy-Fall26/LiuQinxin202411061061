import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CircleDot, FlaskConical, ShieldCheck } from 'lucide-react';
import { EXPERIMENT_META } from '@shared/config';
import { ACTIVE_EXPERIMENT_IDS, type ExperimentId } from '@shared/types';
import { api, type PublicExperiment } from '@/services/api';
import { ExperimentCard } from '@/components/experiments/ExperimentCard';
import { PageHero } from '@/components/ui/PageHero';

export function ExperimentSelectionPage() {
  const [publicData, setPublicData] = useState<PublicExperiment[] | null>(null);

  useEffect(() => {
    let active = true;
    api
      .experiments()
      .then((response) => {
        if (active) setPublicData(response.experiments);
      })
      .catch(() => {
        if (active) setPublicData(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const dataFor = (id: ExperimentId) =>
    publicData?.find((experiment) => experiment.id === id);

  return (
    <>
      <PageHero
        eyebrow="Experiment collection"
        title="选择一项实验"
        english="Two ways of looking"
        breadcrumb={[{ label: '首页', to: '/' }, { label: '实验目录' }]}
        aside={
          <>
            每项实验均可独立参与。两项实验共享同一被试编号与数据框架，
            但数据会分别保存，并可通过编号关联。
          </>
        }
      />

      <section className="section-sm">
        <div className="experiment-grid">
          {ACTIVE_EXPERIMENT_IDS.map((id, index) => {
            const meta = EXPERIMENT_META[id];
            return (
              <div key={id} style={{ display: 'contents' }}>
                <ExperimentCard experiment={meta} index={index} detailed />
              </div>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 18,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px 26px',
            color: 'var(--muted-light)',
            fontSize: 10.5,
          }}
          aria-label="实验参数补充说明"
        >
          {ACTIVE_EXPERIMENT_IDS.map((id) => {
            const data = dataFor(id);
            return (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CircleDot size={10} strokeWidth={1.7} />
                {EXPERIMENT_META[id].zhName}：
                {data
                  ? `${data.practice_trials} 练习 + ${data.formal_trials} 正式试次 · 配置 v${data.config_version}`
                  : `${EXPERIMENT_META[id].durationLabel}`}
              </span>
            );
          })}
        </div>
      </section>

      <section className="section-sm" style={{ paddingTop: 10 }}>
        <div className="process-grid">
          <div className="process-step">
            <div className="process-step__number">01</div>
            <h3>设置被试编号</h3>
            <p>使用研究者事先分配的编号，或由系统生成匿名编号。无需姓名与联系方式。</p>
          </div>
          <div className="process-step">
            <div className="process-step__number">02</div>
            <h3>阅读说明并练习</h3>
            <p>了解实验目的、按键与注意事项。练习阶段不计入正式分析，可重复进行。</p>
          </div>
          <div className="process-step">
            <div className="process-step__number">03</div>
            <h3>完成正式实验</h3>
            <p>正式试次随机呈现。每完成一个试次，数据即写入本地暂存队列并尝试上传。</p>
          </div>
        </div>

        <div
          className="notice notice--mint"
          style={{ marginTop: 22, display: 'flex', gap: 12, alignItems: 'flex-start' }}
        >
          <ShieldCheck size={17} strokeWidth={1.5} style={{ flex: 'none', marginTop: 2 }} />
          <span>
            <strong>实验保护原则：</strong>
            正式试次中不使用装饰性动画、弹窗或动态背景；刺激尺寸与呈现参数由实验配置统一控制。
            浏览器计时不能等同于实验室级光电验证的毫秒精度。
          </span>
        </div>
      </section>

      <section className="section" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div
          className="panel"
          style={{ flex: '1 1 320px', padding: 28, display: 'flex', gap: 16 }}
        >
          <FlaskConical size={20} strokeWidth={1.4} style={{ color: '#7485a6', flex: 'none' }} />
          <div>
            <strong style={{ fontSize: 13 }}>第一次参与？</strong>
            <p className="field-hint" style={{ marginTop: 6 }}>
              建议先阅读实验说明，选择安静、光线稳定、不受打扰的环境，并使用桌面或笔记本浏览器。
            </p>
          </div>
        </div>
        <div
          className="panel"
          style={{ flex: '1 1 320px', padding: 28, display: 'flex', gap: 16 }}
        >
          <CircleDot size={20} strokeWidth={1.4} style={{ color: '#8f84ad', flex: 'none' }} />
          <div>
            <strong style={{ fontSize: 13 }}>已经在研究中？</strong>
            <p className="field-hint" style={{ marginTop: 6 }}>
              请使用研究者提供的编号。相同编号可关联你在不同实验中的记录，但不会收集姓名。
            </p>
          </div>
        </div>
        <Link
          to="/about"
          className="panel"
          style={{
            flex: '1 1 250px',
            padding: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <strong style={{ fontSize: 13 }}>平台、数据与计时说明</strong>
            <p className="field-hint" style={{ marginTop: 6 }}>
              了解我们如何保护实验完整性。
            </p>
          </div>
          <ArrowRight size={17} strokeWidth={1.5} />
        </Link>
      </section>
    </>
  );
}
