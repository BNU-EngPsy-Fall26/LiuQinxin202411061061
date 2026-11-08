import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock3 } from 'lucide-react';
import type { ExperimentMeta } from '@shared/types';
import { ExperimentArt } from './ExperimentArt';

export function ExperimentCard({
  experiment,
  index,
  detailed = false,
}: {
  experiment: ExperimentMeta;
  index: number;
  detailed?: boolean;
}) {
  return (
    <article
      className={`experiment-card experiment-card--${experiment.accent}`}
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div className="experiment-card__top">
        <span className="experiment-index">{experiment.index}</span>
        <span className="experiment-outcome">{experiment.outcome}</span>
      </div>
      <div className="experiment-art">
        <ExperimentArt id={experiment.id} />
      </div>
      <div className="experiment-card__body">
        <div className="experiment-card__en">{experiment.enName}</div>
        <h3 className="experiment-card__title">{experiment.zhName}</h3>
        <p className="experiment-card__tagline">{experiment.tagline}</p>
        {detailed && (
          <p className="experiment-card__description">{experiment.description}</p>
        )}
        <div className="experiment-card__meta">
          <Clock3 size={12} strokeWidth={1.6} />
          <span>{experiment.durationLabel}</span>
          <span className="spacer" />
          <span className="experiment-card__enter">
            <ArrowUpRight size={15} strokeWidth={1.6} />
          </span>
        </div>
      </div>
      <Link
        className="experiment-card__link"
        to={`/enter/${experiment.id}`}
        aria-label={`进入${experiment.zhName}实验：${experiment.tagline}`}
      />
    </article>
  );
}
