import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { EXPERIMENT_META } from '@shared/config';
import { ACTIVE_EXPERIMENT_IDS } from '@shared/types';
import { DreamOrb } from '@/components/layout/DreamBackground';
import { ExperimentCard } from '@/components/experiments/ExperimentCard';

export function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Online cognitive experiments</span>
            <h1 className="display display-title hero-title">
              <span className="line-one">Dreamy</span>
              <span className="line-two">
                Attention <span className="accent">Lab</span>
              </span>
            </h1>
            <div className="hero-zh">梦境注意实验室</div>
            <p className="hero-lede">
              这是一个在线认知心理学实验平台，包含视觉搜索与地图对齐两项任务。
              每项实验约需 10 分钟，开始前会提供说明与练习。
            </p>
            <div className="hero-actions">
              <Link to="/enter" className="btn btn--primary btn--lg">
                开始实验
                <span className="btn-arrow">
                  <ArrowRight size={16} strokeWidth={1.7} />
                </span>
              </Link>
            </div>
            <div className="hero-note">
              <span>无需注册 · 每项约 10 分钟</span>
            </div>
          </div>
          <div className="hero-visual">
            <DreamOrb />
          </div>
        </div>
      </section>

      <section className="section home-experiments" id="experiments">
        <div className="home-experiments__heading">
          <span className="eyebrow">Experiments</span>
          <h2 className="section-title" style={{ marginTop: 20 }}>
            两项实验
          </h2>
        </div>
        <div className="experiment-grid experiment-grid--compact">
          {ACTIVE_EXPERIMENT_IDS.map((id, index) => (
            <ExperimentCard
              key={id}
              experiment={EXPERIMENT_META[id]}
              index={index}
            />
          ))}
        </div>
      </section>
    </>
  );
}
