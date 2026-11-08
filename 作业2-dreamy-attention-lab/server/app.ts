import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import {
  clearResearcherCookie,
  issueResearcherToken,
  RESEARCHER_COOKIE,
  researcherCookie,
  tokenIsValid,
  verifyCredentials,
  type AuthConfig,
} from './auth.js';
import {
  createDatabase,
  getConfig,
  getConfigRow,
  insertTrialWithSamples,
  saveConfig,
  upsertParticipant,
  type LabDb,
  type SessionRow,
} from './db.js';
import {
  completionSchema,
  literatureInputSchema,
  participantIdSchema,
  sessionSchema,
  trialSchema,
  validateExperimentConfig,
} from './validation.js';
import {
  EXPERIMENT_META,
  DEFAULT_CONFIGS,
  enforceOriginalConditions,
} from '../shared/config.js';
import { totalFormalTrials } from '../shared/blocks.js';
import {
  ACTIVE_EXPERIMENT_IDS,
  EXPERIMENT_IDS,
  type ExperimentId,
} from '../shared/types.js';
import { getExportSessions, getExportTrials, parseFilters, trialsToCsv } from './export.js';
import {
  getGroupResults,
  getPersonalResults,
  getTrialSamples,
} from './results.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export interface AppOptions {
  db?: LabDb;
  auth: AuthConfig;
  staticDir?: string;
}

const EXPERIMENT_META_MAP = EXPERIMENT_META;

function parseSummary(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function jsonHeaderAttachment(res: Response, filename: string): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}

function normalizeLiterature(row: Record<string, unknown>) {
  return {
    ...row,
    approximate: row.approximate === 1,
    numeric_value_available: typeof row.mean_value === 'number',
  };
}

function downsample<T>(rows: T[], maxPoints: number): T[] {
  if (rows.length <= maxPoints) return rows;
  const step = rows.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, index) => rows[Math.floor(index * step)]);
}

export function createApp(options: AppOptions) {
  const db = options.db ?? createDatabase(path.resolve(process.cwd(), 'data', 'lab.db'));
  const auth = options.auth;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // WebGazer/TFJS/MediaPipe run locally; wasm compilation and blob
          // workers are required, but no remote script or video upload.
          // MediaPipe's generated loader still calls `new Function` to build
          // named error classes, so `unsafe-eval` is required for calibration
          // to start. This CSP applies only to first-party assets.
          scriptSrc: ["'self'", "'wasm-unsafe-eval'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          // The course-platform homework endpoint is the only cross-origin
          // destination used by the browser (compact per-session upload).
          connectSrc: [
            "'self'",
            'blob:',
            'data:',
            'https://attention-lab-production.up.railway.app',
          ],
          workerSrc: ["'self'", 'blob:'],
          mediaSrc: ["'self'", 'blob:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '6mb' }));
  app.use(cookieParser());

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '请求过于频繁，请稍后再试。' },
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '登录尝试过于频繁，请 15 分钟后再试。' },
  });
  app.use('/api', apiLimiter);

  const isResearcher = (req: Request): boolean =>
    tokenIsValid(auth, req.cookies?.[RESEARCHER_COOKIE]);

  const requireResearcher = (req: Request, res: Response, next: NextFunction): void => {
    if (!isResearcher(req)) {
      res.status(401).json({ error: '需要研究者身份验证。', code: 'UNAUTHORIZED' });
      return;
    }
    next();
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'dreamy-cognitive-lab', time: new Date().toISOString() });
  });

  app.get('/api/experiments', (_req, res) => {
    res.json({
      experiments: ACTIVE_EXPERIMENT_IDS.map((id) => {
        const config = getConfig(db, id);
        return {
          ...EXPERIMENT_META_MAP[id],
          config_version: config.version,
          practice_trials: config.practiceTrials,
          formal_trials: totalFormalTrials(config),
          estimated_minutes: EXPERIMENT_META_MAP[id].durationLabel,
        };
      }),
    });
  });

  app.get('/api/experiments/:id/config', (req, res) => {
    const id = req.params.id as ExperimentId;
    if (!EXPERIMENT_IDS.includes(id)) {
      res.status(404).json({ error: '未知实验。' });
      return;
    }
    const row = getConfigRow(db, id);
    // Serve the validated, block-aware shape even when the stored row predates
    // the block model. Otherwise legacy rows would send `formalTrials` without
    // `blocks` and the participant runtime could not build a session.
    const config = getConfig(db, id);
    res.json({
      experiment_id: id,
      // `config.version` may be newer than the stored row when a legacy
      // pre-block config is normalised to the current default block model.
      version: config.version,
      updated_at: row.updated_at,
      config,
      meta: EXPERIMENT_META_MAP[id],
    });
  });

  // Create (or idempotently re-send) a participant session.
  app.post('/api/sessions', (req, res) => {
    const parsed = sessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '会话数据格式不正确。', issues: parsed.error.issues });
      return;
    }
    const input = parsed.data;
    const configCheck = validateExperimentConfig(input.experiment_id, input.config_snapshot);
    if (!configCheck.success) {
      res.status(400).json({ error: '实验配置快照无效。', issues: configCheck.issues });
      return;
    }

    try {
      upsertParticipant(db, input.participant_id);
      const existing = db
        .prepare('SELECT session_id FROM sessions WHERE session_id = ?')
        .get(input.session_id);
      if (!existing) {
        db.prepare(
          `INSERT INTO sessions (
            session_id, participant_id, experiment_id, started_at, completed_at,
            status, config_version, config_snapshot, environment_json, summary_json,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        ).run(
          input.session_id,
          input.participant_id,
          input.experiment_id,
          input.started_at,
          input.completed_at,
          input.status,
          input.config_version,
          JSON.stringify(input.config_snapshot),
          JSON.stringify(input.environment),
          new Date().toISOString(),
          new Date().toISOString(),
        );
      }
      res.status(201).json({ session_id: input.session_id, accepted: true });
    } catch (error) {
      console.error('session create failed', error);
      res.status(500).json({ error: '会话创建失败，请稍后重试。' });
    }
  });

  app.post('/api/trials', (req, res) => {
    const parsed = trialSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '试次数据格式不正确。', issues: parsed.error.issues });
      return;
    }
    const input = parsed.data;
    const session = db
      .prepare(
        `SELECT participant_id, experiment_id FROM sessions WHERE session_id = ?`,
      )
      .get(input.session_id) as
      | { participant_id: string; experiment_id: string }
      | undefined;
    if (!session) {
      res.status(409).json({
        error: '对应会话尚未建立，客户端将按顺序重试。',
        code: 'SESSION_NOT_READY',
      });
      return;
    }
    if (
      session.participant_id !== input.participant_id ||
      session.experiment_id !== input.experiment_id
    ) {
      res.status(409).json({ error: '试次与会话信息不一致。' });
      return;
    }

    try {
      insertTrialWithSamples(db, input);
      res.status(201).json({
        trial_id: input.trial_id,
        accepted: true,
        gaze_samples: input.gaze_samples?.length ?? 0,
        mouse_samples: input.mouse_samples?.length ?? 0,
      });
    } catch (error) {
      console.error('trial save failed', error);
      res.status(500).json({ error: '试次保存失败。' });
    }
  });

  app.post('/api/sessions/:id/complete', (req, res) => {
    const parsed = completionSchema.safeParse({
      ...req.body,
      session_id: req.params.id,
    });
    if (!parsed.success) {
      res.status(400).json({ error: '完成数据格式不正确。', issues: parsed.error.issues });
      return;
    }
    const session = db
      .prepare('SELECT session_id FROM sessions WHERE session_id = ?')
      .get(req.params.id);
    if (!session) {
      res.status(404).json({ error: '会话不存在。' });
      return;
    }
    db.prepare(
      `UPDATE sessions
       SET status = 'completed', completed_at = ?, summary_json = ?, updated_at = ?
       WHERE session_id = ?`,
    ).run(
      parsed.data.completed_at,
      JSON.stringify(parsed.data.summary),
      new Date().toISOString(),
      req.params.id,
    );
    res.json({ completed: true });
  });

  app.get('/api/sessions/:id/result', (req, res) => {
    const row = db
      .prepare(
        `SELECT status, summary_json, config_snapshot, experiment_id
         FROM sessions WHERE session_id = ?`,
      )
      .get(req.params.id) as
      | Pick<SessionRow, 'status' | 'summary_json' | 'config_snapshot' | 'experiment_id'>
      | undefined;
    if (!row) {
      res.status(404).json({ error: '未找到实验记录。' });
      return;
    }
    let showResults = true;
    try {
      const config = JSON.parse(row.config_snapshot) as {
        showResultsToParticipant?: boolean;
      };
      showResults = config.showResultsToParticipant !== false;
    } catch {
      showResults = true;
    }
    res.json({
      session_id: req.params.id,
      experiment_id: row.experiment_id,
      status: row.status,
      show_results: showResults,
      summary: showResults ? parseSummary(row.summary_json) : null,
    });
  });

  // ---------- Participant results and literature ----------

  app.get('/api/results/:experimentId/group', (req, res) => {
    const id = req.params.experimentId as ExperimentId;
    if (!EXPERIMENT_IDS.includes(id)) {
      res.status(404).json({ error: '未知实验。' });
      return;
    }
    const viewerParticipantId =
      typeof req.query.participant_id === 'string'
        ? req.query.participant_id.trim()
        : null;
    let viewerSessionId =
      typeof req.query.session_id === 'string' ? req.query.session_id : null;
    let viewerParam = viewerParticipantId;
    if (viewerParam) {
      const checked = participantIdSchema.safeParse(viewerParam);
      if (!checked.success) viewerParam = null;
    }
    if (viewerParam && viewerSessionId) {
      const owns = db
        .prepare(
          `SELECT 1 AS ok FROM sessions
           WHERE session_id = ? AND participant_id = ? AND experiment_id = ?
             AND status = 'completed'`,
        )
        .get(viewerSessionId, viewerParam, id);
      if (!owns) viewerSessionId = null;
    }
    if (viewerParam && !viewerSessionId) {
      const latest = db
        .prepare(
          `SELECT session_id FROM sessions
           WHERE participant_id = ? AND experiment_id = ? AND status = 'completed'
           ORDER BY COALESCE(completed_at, started_at) DESC LIMIT 1`,
        )
        .get(viewerParam, id) as { session_id: string } | undefined;
      viewerSessionId = latest?.session_id ?? null;
    }
    const config = getConfig(db, id);
    res.json(
      getGroupResults({
        db,
        experimentId: id,
        config,
        viewerParticipantId: viewerParam,
        viewerSessionId,
      }),
    );
  });

  app.get('/api/results/:experimentId', (req, res) => {
    const id = req.params.experimentId as ExperimentId;
    if (!EXPERIMENT_IDS.includes(id)) {
      res.status(404).json({ error: '未知实验。' });
      return;
    }
    const participant = participantIdSchema.safeParse(req.query.participant_id ?? '');
    const sessionId =
      typeof req.query.session_id === 'string' ? req.query.session_id : '';
    if (!participant.success || !sessionId) {
      res.status(400).json({ error: '需要有效的被试编号与会话编号。' });
      return;
    }
    const session = db
      .prepare(
        `SELECT config_snapshot, status FROM sessions
         WHERE session_id = ? AND participant_id = ? AND experiment_id = ?`,
      )
      .get(sessionId, participant.data, id) as
      | { config_snapshot: string; status: string }
      | undefined;
    if (!session) {
      res.status(404).json({ error: '未找到对应的实验记录。' });
      return;
    }
    let showResults = true;
    try {
      const snapshot = JSON.parse(session.config_snapshot) as {
        showResultsToParticipant?: boolean;
      };
      showResults = snapshot.showResultsToParticipant !== false;
    } catch {
      showResults = true;
    }
    if (!showResults) {
      res.status(403).json({
        error: '研究者已关闭个人结果展示。',
        code: 'RESULTS_DISABLED',
      });
      return;
    }
    const result = getPersonalResults({
      db,
      experimentId: id,
      participantId: participant.data,
      sessionId,
      config: getConfig(db, id),
    });
    if (!result) {
      res.status(404).json({ error: '未找到对应的实验记录。' });
      return;
    }
    res.json(result);
  });

  app.get('/api/results/:experimentId/trials/:trialId/samples', (req, res) => {
    const id = req.params.experimentId as ExperimentId;
    if (!EXPERIMENT_IDS.includes(id)) {
      res.status(404).json({ error: '未知实验。' });
      return;
    }
    const participant = participantIdSchema.safeParse(req.query.participant_id ?? '');
    const sessionId =
      typeof req.query.session_id === 'string' ? req.query.session_id : '';
    if (!participant.success || !sessionId) {
      res.status(400).json({ error: '需要有效的被试编号与会话编号。' });
      return;
    }
    const samples = getTrialSamples({
      db,
      experimentId: id,
      participantId: participant.data,
      sessionId,
      trialId: String(req.params.trialId),
    });
    if (!samples) {
      res.status(404).json({ error: '未找到该试次或无权查看。' });
      return;
    }
    res.json(samples);
  });

  app.get('/api/literature/:experimentId', (req, res) => {
    const id = req.params.experimentId as ExperimentId;
    if (!EXPERIMENT_IDS.includes(id)) {
      res.status(404).json({ error: '未知实验。' });
      return;
    }
    const rows = db
      .prepare(
        `SELECT * FROM literature
         WHERE experiment_id = ?
         ORDER BY sort_order ASC, year DESC, authors ASC`,
      )
      .all(id) as Array<Record<string, unknown>>;
    res.json({
      experiment_id: id,
      records: rows.map(normalizeLiterature),
      comparison: {
        directly_comparable_rows: 0,
        message:
          '暂无可比较的文献数据：现有文献的任务、刺激、set size、反应方式或因变量与本平台不同。下表中的数值仅作背景，不与个人或群体数据合并，也不做显著性检验。',
      },
    });
  });

  // ---------- Researcher authentication ----------

  app.post('/api/researcher/login', loginLimiter, (req, res) => {
    const body = z
      .object({
        username: z.string().max(80).default('researcher'),
        password: z.string().max(200),
      })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: '请输入用户名和密码。' });
      return;
    }
    if (!verifyCredentials(auth, body.data.username, body.data.password)) {
      res.status(401).json({ error: '用户名或密码不正确。' });
      return;
    }
    const token = issueResearcherToken(auth);
    res.setHeader('Set-Cookie', researcherCookie(auth, token));
    res.json({ authenticated: true, username: auth.username });
  });

  app.post('/api/researcher/logout', (_req, res) => {
    res.setHeader('Set-Cookie', clearResearcherCookie(auth));
    res.json({ authenticated: false });
  });

  app.get('/api/researcher/me', (req, res) => {
    res.json({ authenticated: isResearcher(req), username: isResearcher(req) ? auth.username : null });
  });

  // ---------- Researcher data ----------

  app.get('/api/researcher/overview', requireResearcher, (_req, res) => {
    const totals = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM participants) AS participants,
           (SELECT COUNT(*) FROM sessions) AS sessions,
           (SELECT COUNT(*) FROM sessions WHERE status = 'completed') AS completed_sessions,
           (SELECT COUNT(*) FROM trials) AS trials`,
      )
      .get() as {
      participants: number;
      sessions: number;
      completed_sessions: number;
      trials: number;
    };

    const perExperiment = EXPERIMENT_IDS.map((id) => {
      const stats = db
        .prepare(
          `SELECT
             COUNT(*) AS sessions,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
             COUNT(DISTINCT participant_id) AS participants
           FROM sessions WHERE experiment_id = ?`,
        )
        .get(id) as { sessions: number; completed: number; participants: number };
      const trialStats = db
        .prepare(
          `SELECT COUNT(*) AS trials,
             SUM(CASE WHEN phase = 'formal' THEN 1 ELSE 0 END) AS formal_trials
           FROM trials WHERE experiment_id = ?`,
        )
        .get(id) as { trials: number; formal_trials: number };
      return {
        experiment_id: id,
        ...EXPERIMENT_META_MAP[id],
        sessions: stats.sessions,
        completed: stats.completed ?? 0,
        participants: stats.participants,
        trials: trialStats.trials ?? 0,
        formal_trials: trialStats.formal_trials ?? 0,
      };
    });

    const recent = db
      .prepare(
        `SELECT session_id, participant_id, experiment_id, started_at, completed_at, status,
                summary_json
         FROM sessions ORDER BY started_at DESC LIMIT 10`,
      )
      .all() as Array<Omit<SessionRow, 'config_snapshot' | 'config_version' | 'environment_json' | 'created_at' | 'updated_at'>>;

    res.json({
      totals,
      per_experiment: perExperiment,
      recent_sessions: recent.map((row) => ({
        ...row,
        summary: parseSummary(row.summary_json),
        summary_json: undefined,
      })),
    });
  });

  app.get('/api/researcher/participants', requireResearcher, (req, res) => {
    const search =
      typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const rows = db
      .prepare(
        `SELECT participant_id,
                COUNT(DISTINCT session_id) AS session_count,
                GROUP_CONCAT(DISTINCT experiment_id) AS experiments,
                MIN(started_at) AS first_seen_at,
                MAX(started_at) AS last_seen_at
         FROM sessions
         ${search ? 'WHERE participant_id LIKE ?' : ''}
         GROUP BY participant_id
         ORDER BY last_seen_at DESC
         LIMIT 500`,
      )
      .all(...(search ? [`%${search}%`] : [])) as Array<{
      participant_id: string;
      session_count: number;
      experiments: string;
      first_seen_at: string;
      last_seen_at: string;
    }>;
    res.json({
      participants: rows.map((row) => ({
        ...row,
        experiments: row.experiments ? row.experiments.split(',') : [],
      })),
    });
  });

  app.get('/api/researcher/sessions', requireResearcher, (req, res) => {
    const experimentId =
      typeof req.query.experiment_id === 'string' ? req.query.experiment_id : '';
    const participantId =
      typeof req.query.participant_id === 'string'
        ? req.query.participant_id.trim()
        : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const blockId =
      typeof req.query.block_id === 'string' ? req.query.block_id.trim() : '';
    const eyeTrackingStatus =
      typeof req.query.eye_tracking_status === 'string'
        ? req.query.eye_tracking_status
        : '';
    const minGazeRaw =
      typeof req.query.min_valid_gaze_ratio === 'string'
        ? Number.parseFloat(req.query.min_valid_gaze_ratio)
        : Number.NaN;
    const limit = Math.min(
      Math.max(Number.parseInt(String(req.query.limit ?? '50'), 10) || 50, 1),
      200,
    );
    const offset = Math.max(Number.parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

    const where: string[] = [];
    const params: Array<string | number> = [];
    if (experimentId && EXPERIMENT_IDS.includes(experimentId as ExperimentId)) {
      where.push('s.experiment_id = ?');
      params.push(experimentId);
    }
    if (participantId) {
      where.push('s.participant_id LIKE ?');
      params.push(`%${participantId}%`);
    }
    if (status === 'completed' || status === 'in_progress') {
      where.push('s.status = ?');
      params.push(status);
    }
    if (blockId) {
      where.push(
        'EXISTS (SELECT 1 FROM trials tb WHERE tb.session_id = s.session_id AND tb.block_id = ?)',
      );
      params.push(blockId);
    }
    if (eyeTrackingStatus) {
      where.push(
        'EXISTS (SELECT 1 FROM trials te WHERE te.session_id = s.session_id AND te.eye_tracking_status = ?)',
      );
      params.push(eyeTrackingStatus);
    }
    if (Number.isFinite(minGazeRaw)) {
      where.push(
        'EXISTS (SELECT 1 FROM trials tg WHERE tg.session_id = s.session_id AND tg.valid_gaze_ratio >= ?)',
      );
      params.push(Math.max(0, Math.min(1, minGazeRaw)));
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM sessions s ${whereSql}`).get(...params) as {
        n: number;
      }
    ).n;
    const rows = db
      .prepare(
        `SELECT s.session_id, s.participant_id, s.experiment_id, s.started_at,
                s.completed_at, s.status, s.summary_json, s.config_version,
                COUNT(t.trial_id) AS trial_count,
                SUM(CASE WHEN t.phase = 'formal' THEN 1 ELSE 0 END) AS formal_trial_count
         FROM sessions s
         LEFT JOIN trials t ON t.session_id = s.session_id
         ${whereSql}
         GROUP BY s.session_id
         ORDER BY s.started_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Array<
      Omit<SessionRow, 'config_snapshot' | 'environment_json' | 'created_at' | 'updated_at' | 'summary_json'> & {
        trial_count: number;
        formal_trial_count: number;
        summary_json: string | null;
      }
    >;
    res.json({
      total,
      limit,
      offset,
      sessions: rows.map((row) => ({
        ...row,
        summary: parseSummary(row.summary_json),
        summary_json: undefined,
      })),
    });
  });

  app.get('/api/researcher/sessions/:id', requireResearcher, (req, res) => {
    const sessionId = String(req.params.id);
    const session = db
      .prepare('SELECT * FROM sessions WHERE session_id = ?')
      .get(sessionId) as SessionRow | undefined;
    if (!session) {
      res.status(404).json({ error: '未找到该会话。' });
      return;
    }
    const trials = db
      .prepare('SELECT * FROM trials WHERE session_id = ? ORDER BY phase, trial_index')
      .all(sessionId) as Array<Record<string, unknown>>;
    res.json({
      session: {
        ...session,
        config_snapshot: JSON.parse(session.config_snapshot),
        environment_json: session.environment_json
          ? JSON.parse(session.environment_json)
          : {},
        summary_json: parseSummary(session.summary_json),
      },
      trials: trials.map((trial) => ({
        ...trial,
        correct: trial.correct === null ? null : Boolean(trial.correct),
        timeout: Boolean(trial.timeout),
        invalid_response: Boolean(trial.invalid_response),
        stimulus_json: JSON.parse(String(trial.stimulus_json)),
        response_json: JSON.parse(String(trial.response_json)),
        tracking_json: JSON.parse(String(trial.tracking_json)),
        metadata_json: JSON.parse(String(trial.metadata_json)),
      })),
    });
  });

  app.get('/api/researcher/configs', requireResearcher, (_req, res) => {
    res.json({
      configs: EXPERIMENT_IDS.map((id) => {
        const config = getConfig(db, id);
        return {
          experiment_id: id,
          meta: EXPERIMENT_META_MAP[id],
          config,
          defaults: DEFAULT_CONFIGS[id],
        };
      }),
    });
  });

  app.put('/api/researcher/configs/:id', requireResearcher, (req, res) => {
    const id = req.params.id as ExperimentId;
    if (!EXPERIMENT_IDS.includes(id)) {
      res.status(404).json({ error: '未知实验。' });
      return;
    }
    const input = req.body?.config ?? req.body;
    const validated = validateExperimentConfig(id, input);
    if (!validated.success) {
      res.status(400).json({ error: '配置校验失败。', issues: validated.issues });
      return;
    }
    const saved = saveConfig(
      db,
      id,
      enforceOriginalConditions(id, validated.data),
    );
    res.json({ saved: true, experiment_id: id, config: saved });
  });

  app.post('/api/researcher/configs/:id/reset', requireResearcher, (req, res) => {
    const id = req.params.id as ExperimentId;
    if (!EXPERIMENT_IDS.includes(id)) {
      res.status(404).json({ error: '未知实验。' });
      return;
    }
    const saved = saveConfig(db, id, structuredClone(DEFAULT_CONFIGS[id]));
    res.json({ reset: true, experiment_id: id, config: saved });
  });

  app.get(
    '/api/researcher/sessions/:id/trials/:trialId/samples',
    requireResearcher,
    (req, res) => {
      const sessionId = String(req.params.id);
      const trial = db
        .prepare(
          'SELECT trial_id, participant_id, experiment_id FROM trials WHERE trial_id = ? AND session_id = ?',
        )
        .get(String(req.params.trialId), sessionId) as
        | { trial_id: string; participant_id: string; experiment_id: ExperimentId }
        | undefined;
      if (!trial) {
        res.status(404).json({ error: '未找到该试次。' });
        return;
      }
      const samples = getTrialSamples({
        db,
        experimentId: trial.experiment_id,
        participantId: trial.participant_id,
        sessionId,
        trialId: trial.trial_id,
      });
      if (!samples) {
        res.status(404).json({ error: '未找到该试次。' });
        return;
      }
      const requested = Number.parseInt(String(req.query.max_points ?? '2000'), 10);
      const maxPoints = Math.min(Math.max(requested || 2000, 50), 5000);
      res.json({
        ...samples,
        gaze_samples: downsample(samples.gaze_samples, maxPoints),
        mouse_samples: downsample(samples.mouse_samples, maxPoints),
        max_points: maxPoints,
      });
    },
  );

  app.get('/api/researcher/literature', requireResearcher, (req, res) => {
    const experimentId =
      typeof req.query.experiment_id === 'string' ? req.query.experiment_id : '';
    const rows = db
      .prepare(
        `SELECT * FROM literature
         ${experimentId ? 'WHERE experiment_id = ?' : ''}
         ORDER BY experiment_id, sort_order, year DESC, authors`,
      )
      .all(...(experimentId ? [experimentId] : [])) as Array<Record<string, unknown>>;
    res.json({ records: rows.map(normalizeLiterature), total: rows.length });
  });

  app.post('/api/researcher/literature', requireResearcher, (req, res) => {
    const parsed = literatureInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '文献数据格式不正确。', issues: parsed.error.issues });
      return;
    }
    const input = parsed.data;
    const id = `lit-${randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO literature (
        literature_id, experiment_id, block_variant, title, authors, year, journal,
        doi, url, sample_size, task, condition, dependent_variable, mean_value,
        sd_value, se_value, unit, source_page, extraction_method,
        comparability_note, approximate, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.experiment_id,
      input.block_variant ?? null,
      input.title,
      input.authors,
      input.year,
      input.journal ?? null,
      input.doi ?? null,
      input.url ?? null,
      input.sample_size ?? null,
      input.task,
      input.condition,
      input.dependent_variable,
      input.mean_value ?? null,
      input.sd_value ?? null,
      input.se_value ?? null,
      input.unit ?? null,
      input.source_page,
      input.extraction_method,
      input.comparability_note,
      input.approximate ? 1 : 0,
      input.sort_order,
      now,
      now,
    );
    const row = db
      .prepare('SELECT * FROM literature WHERE literature_id = ?')
      .get(id) as Record<string, unknown>;
    res.status(201).json({ saved: true, record: normalizeLiterature(row) });
  });

  app.put('/api/researcher/literature/:id', requireResearcher, (req, res) => {
    const literatureId = String(req.params.id);
    const parsed = literatureInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '文献数据格式不正确。', issues: parsed.error.issues });
      return;
    }
    const existing = db
      .prepare('SELECT literature_id FROM literature WHERE literature_id = ?')
      .get(literatureId);
    if (!existing) {
      res.status(404).json({ error: '未找到该文献记录。' });
      return;
    }
    const input = parsed.data;
    db.prepare(
      `UPDATE literature SET
        experiment_id = ?, block_variant = ?, title = ?, authors = ?, year = ?,
        journal = ?, doi = ?, url = ?, sample_size = ?, task = ?, condition = ?,
        dependent_variable = ?, mean_value = ?, sd_value = ?, se_value = ?, unit = ?,
        source_page = ?, extraction_method = ?, comparability_note = ?,
        approximate = ?, sort_order = ?, updated_at = ?
       WHERE literature_id = ?`,
    ).run(
      input.experiment_id,
      input.block_variant ?? null,
      input.title,
      input.authors,
      input.year,
      input.journal ?? null,
      input.doi ?? null,
      input.url ?? null,
      input.sample_size ?? null,
      input.task,
      input.condition,
      input.dependent_variable,
      input.mean_value ?? null,
      input.sd_value ?? null,
      input.se_value ?? null,
      input.unit ?? null,
      input.source_page,
      input.extraction_method,
      input.comparability_note,
      input.approximate ? 1 : 0,
      input.sort_order,
      new Date().toISOString(),
      literatureId,
    );
    const row = db
      .prepare('SELECT * FROM literature WHERE literature_id = ?')
      .get(literatureId) as Record<string, unknown>;
    res.json({ saved: true, record: normalizeLiterature(row) });
  });

  app.delete('/api/researcher/literature/:id', requireResearcher, (req, res) => {
    const result = db
      .prepare('DELETE FROM literature WHERE literature_id = ?')
      .run(String(req.params.id));
    if (result.changes === 0) {
      res.status(404).json({ error: '未找到该文献记录。' });
      return;
    }
    res.json({ deleted: true });
  });

  app.get('/api/researcher/export.csv', requireResearcher, (req, res) => {
    const filters = parseFilters(req.query as Record<string, unknown>);
    const rows = getExportTrials(db, filters);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="dreamy-lab-trials-${stamp}.csv"`,
    );
    res.send(trialsToCsv(rows));
  });

  app.get('/api/researcher/export.json', requireResearcher, (req, res) => {
    const filters = parseFilters(req.query as Record<string, unknown>);
    const sessions = getExportSessions(db, filters);
    const stamp = new Date().toISOString().slice(0, 10);
    jsonHeaderAttachment(res, `dreamy-lab-export-${stamp}.json`);
    res.send(
      JSON.stringify(
        {
          exported_at: new Date().toISOString(),
          platform: 'Dreamy Attention Lab',
          filters,
          session_count: sessions.length,
          sessions,
        },
        null,
        2,
      ),
    );
  });

  app.get('/api/researcher/validate-participant', requireResearcher, (req, res) => {
    const parsed = participantIdSchema.safeParse(req.query.id ?? '');
    res.json({ valid: parsed.success, issues: parsed.success ? [] : parsed.error.issues });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API 路径不存在。' });
  });

  if (options.staticDir && fs.existsSync(options.staticDir)) {
    app.use(
      express.static(options.staticDir, {
        maxAge: '1y',
        immutable: true,
        index: false,
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(path.join(options.staticDir as string, 'index.html'));
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled API error:', error);
    if (res.headersSent) return;
    res.status(500).json({ error: '服务器内部错误。' });
  });

  return app;
}
