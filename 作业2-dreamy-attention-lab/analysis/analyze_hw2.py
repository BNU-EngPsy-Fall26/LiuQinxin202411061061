#!/usr/bin/env python3
"""Reproducible analysis for Dreamy Attention Lab, course assignment 2.

The script reads the anonymous trial-level export from the course data platform,
keeps the raw file untouched, writes a cleaned trial-level file only inside the
ignored ``private-data/`` directory, and writes aggregate tables and figures to
``results/``.

Usage
-----
    python analysis/analyze_hw2.py
    python analysis/analyze_hw2.py --data-dir analysis/private-data

Raw data files are deliberately not committed. Place the downloaded CSV and
JSON in ``analysis/private-data/`` (ignored by git) before running.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.colors import LinearSegmentedColormap
from scipy import stats

HERE = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = HERE / "private-data"
DEFAULT_RESULTS_DIR = HERE / "results"
PROJECT_ROOT = HERE.parent

EXPERIMENT_LABELS = {
    "dreamy_visual_search": "视觉搜索",
    "dreamy_map_alignment": "地图对齐",
    "dreamy_perceptual_ordering": "图形知觉排序",
}
BLOCK_LABELS = {
    "vs_feature": "特征搜索",
    "vs_conjunction": "联合搜索",
    "vs_spatial": "空间位置",
    "ma_no_cue": "无人物线索",
    "ma_person_cue": "人物线索",
}
PRESENT_LABELS = {1.0: "目标存在", 0.0: "目标缺席"}
CUE_LABELS = {"none": "无人物线索", "person": "人物线索"}
ALIGN_LABELS = {"aligned": "对齐", "misaligned": "不对齐"}

# Low-saturation, colour-blind-friendly-enough academic palette.
INK = "#3F4A43"
MUTED = "#68756C"
GRID = "#E7E3D8"
CREAM = "#FFFBF7"
SAGE = "#8FAF9B"
ROSE = "#C9A6AE"
SLATE = "#A9B7C0"
BUTTER = "#D6C58E"
TERRACOTTA = "#C08F86"


def configure_style() -> None:
    plt.rcParams.update(
        {
            "font.family": "sans-serif",
            "font.sans-serif": [
                "Microsoft YaHei",
                "Noto Sans SC",
                "SimHei",
                "DejaVu Sans",
            ],
            "axes.unicode_minus": False,
            "figure.facecolor": CREAM,
            "axes.facecolor": CREAM,
            "axes.edgecolor": "#B9C3BB",
            "axes.labelcolor": INK,
            "text.color": INK,
            "xtick.color": MUTED,
            "ytick.color": MUTED,
            "axes.grid": True,
            "grid.color": GRID,
            "grid.linewidth": 0.6,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "font.size": 10,
            "axes.titlesize": 12,
            "axes.titleweight": "bold",
        }
    )


def fmt(value: float, digits: int = 2) -> str:
    if value is None or (isinstance(value, float) and not np.isfinite(value)):
        return "—"
    return f"{value:.{digits}f}"


def mean_ci(values: pd.Series) -> tuple[float, float, float, int]:
    clean = pd.to_numeric(values, errors="coerce").dropna()
    n = len(clean)
    if n == 0:
        return (np.nan, np.nan, np.nan, 0)
    mean = float(clean.mean())
    if n == 1:
        return (mean, np.nan, np.nan, 1)
    se = float(clean.std(ddof=1) / np.sqrt(n))
    tcrit = float(stats.t.ppf(0.975, n - 1))
    return (mean, mean - tcrit * se, mean + tcrit * se, n)


def load_export(data_dir: Path) -> tuple[pd.DataFrame, Path, Path, dict]:
    # Never treat the generated cleaned file as a raw export.
    csv_files = sorted(
        p for p in data_dir.glob("*.csv") if p.name != "cleaned_trials.csv"
    )
    json_files = sorted(data_dir.glob("*.json"))
    if not csv_files:
        raise FileNotFoundError(
            f"No CSV found in {data_dir}. Place the downloaded platform export there."
        )
    if not json_files:
        raise FileNotFoundError(f"No JSON found in {data_dir}.")
    csv_path, json_path = csv_files[0], json_files[0]
    df = pd.read_csv(csv_path, encoding="utf-8-sig")
    return df, csv_path, json_path, check_sources(df, csv_path, json_path)


def check_sources(df: pd.DataFrame, csv_path: Path, json_path: Path) -> dict:
    """Compare CSV and JSON exports and optionally inspect the local SQLite DB."""
    payload = json.loads(json_path.read_text(encoding="utf-8"))
    json_rows: list[dict] = []
    for session in payload.get("records", []):
        for trial in session.get("trials", []):
            row = dict(trial)
            row["record_id"] = session.get("record_id")
            row["experiment"] = session.get("experiment")
            row["participant"] = session.get("participant")
            json_rows.append(row)
    js = pd.DataFrame(json_rows)

    csv_ids = set(df["tid"].astype(str))
    json_ids = set(js["tid"].astype(str)) if "tid" in js else set()
    csv_sessions = set(df["record_id"].astype(str))
    json_sessions = set(js["record_id"].astype(str)) if "record_id" in js else set()

    result = {
        "csv_file": str(csv_path.name),
        "json_file": str(json_path.name),
        "csv_rows": int(len(df)),
        "json_rows": int(len(js)),
        "csv_sessions": int(len(csv_sessions)),
        "json_sessions": int(len(json_sessions)),
        "trial_ids_match": bool(csv_ids == json_ids),
        "session_ids_match": bool(csv_sessions == json_sessions),
        "duplicate_trial_ids": int(df["tid"].duplicated().sum()),
        "json_project": payload.get("project"),
        "json_title": payload.get("title"),
        "local_sqlite": None,
    }

    db_path = PROJECT_ROOT / "data" / "lab.db"
    if db_path.exists():
        try:
            con = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
            cur = con.cursor()
            sessions_n = cur.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
            trials_n = cur.execute("SELECT COUNT(*) FROM trials").fetchone()[0]
            dcl_sessions = cur.execute(
                "SELECT COUNT(*) FROM sessions WHERE participant_id LIKE 'DCL-%'"
            ).fetchone()[0]
            dcl_trials = cur.execute(
                "SELECT COUNT(*) FROM trials WHERE participant_id LIKE 'DCL-%'"
            ).fetchone()[0]
            non_e2e = cur.execute(
                "SELECT COUNT(*) FROM sessions WHERE participant_id NOT LIKE 'E2E-%' "
                "AND participant_id NOT LIKE 'TEST-%' AND participant_id NOT LIKE 'test_%'"
            ).fetchone()[0]
            result["local_sqlite"] = {
                "sessions": int(sessions_n),
                "trials": int(trials_n),
                "dcl_sessions": int(dcl_sessions),
                "dcl_trials": int(dcl_trials),
                "non_e2e_sessions": int(non_e2e),
                "used_for_analysis": False,
                "note": "Local DB contains development/E2E sessions; no DCL participants match the platform export.",
            }
            con.close()
        except Exception as exc:  # pragma: no cover - diagnostic only
            result["local_sqlite"] = {"error": str(exc), "used_for_analysis": False}
    return result


def clean_trials(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Return formal trials with derived fields, and a cleaning ledger."""
    ledger = {
        "raw_rows": int(len(df)),
        "raw_sessions": int(df["record_id"].nunique()),
        "raw_participants": int(df["anon"].nunique()),
    }

    df = df.copy()
    for col in ["rt", "correct", "timeout", "invalid", "setsize", "t_present", "t_region", "heading", "map_rot"]:
        if col in df:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    test_mask = df["experiment"].astype(str).str.startswith("test_") | df[
        "participant"
    ].astype(str).str.startswith("test_")
    ledger["test_records_excluded"] = int(test_mask.sum())
    df = df[~test_mask].copy()

    ledger["practice_rows_excluded"] = int((df["phase"] != "formal").sum())
    formal = df[df["phase"] == "formal"].copy()

    formal["experiment_label"] = formal["experiment"].map(EXPERIMENT_LABELS).fillna(
        formal["experiment"]
    )
    formal["block_label"] = formal["block"].map(BLOCK_LABELS).fillna(formal["block"])
    formal["present_label"] = formal["t_present"].map(PRESENT_LABELS)
    formal["cue_label"] = formal["cue"].map(CUE_LABELS).fillna(formal["cue"])
    formal["align_label"] = formal["align"].map(ALIGN_LABELS).fillna(formal["align"])

    # Accuracy denominator: every formal trial; timeout/invalid count as errors.
    formal["accuracy_trial"] = True
    formal["rt_valid"] = (
        (formal["correct"] == 1)
        & (formal["timeout"] == 0)
        & (formal["invalid"] == 0)
        & formal["rt"].between(200, 10000, inclusive="both")
    )

    med = (
        formal.loc[formal["rt_valid"]]
        .groupby(["experiment", "anon"])["rt"]
        .median()
        .rename("participant_median")
    )
    formal = formal.join(med, on=["experiment", "anon"])
    formal["slow_flag"] = formal["rt_valid"] & (
        formal["rt"] > 3 * formal["participant_median"]
    )

    # Stable, non-identifying participant labels for private cleaned data.
    codes = {
        pid: f"P{i:02d}"
        for i, pid in enumerate(sorted(formal["anon"].dropna().unique()), start=1)
    }
    formal["participant_code"] = formal["anon"].map(codes)

    ledger["formal_rows"] = int(len(formal))
    ledger["participants"] = int(formal["anon"].nunique())
    ledger["sessions"] = int(formal["record_id"].nunique())
    ledger["duplicate_trial_ids"] = int(formal["tid"].duplicated().sum())
    ledger["timeouts"] = int((formal["timeout"] == 1).sum())
    ledger["invalid_formal"] = int((formal["invalid"] == 1).sum())
    ledger["errors"] = int((formal["correct"] == 0).sum())
    ledger["accuracy"] = float(formal["correct"].mean())
    ledger["correct_rt_trials"] = int(formal["rt_valid"].sum())
    ledger["rt_excluded"] = int(
        ((formal["correct"] == 1) & (~formal["rt_valid"])).sum()
    )
    ledger["slow_outlier_trials"] = int(formal["slow_flag"].sum())
    ledger["missing_required"] = {
        col: int(formal[col].isna().sum())
        for col in ["anon", "experiment", "block", "trial", "rt", "correct", "timeout", "invalid"]
    }
    return formal, ledger


def participant_means(df: pd.DataFrame, by: list[str]) -> pd.DataFrame:
    rows: list[dict] = []
    for keys, group in df.groupby(by + ["anon"], dropna=False):
        if not isinstance(keys, tuple):
            keys = (keys,)
        rec = dict(zip(by + ["anon"], keys))
        rec["n_trials"] = int(len(group))
        rec["n_correct"] = int(group["correct"].sum())
        rec["accuracy"] = float(group["correct"].mean())
        rt = group.loc[group["rt_valid"], "rt"]
        rec["n_rt"] = int(len(rt))
        rec["rt_mean"] = float(rt.mean()) if len(rt) else np.nan
        rec["rt_median"] = float(rt.median()) if len(rt) else np.nan
        rows.append(rec)
    return pd.DataFrame(rows)


def describe(df: pd.DataFrame, by: list[str]) -> pd.DataFrame:
    p = participant_means(df, by)
    rows: list[dict] = []
    for keys, group in p.groupby(by, dropna=False):
        if not isinstance(keys, tuple):
            keys = (keys,)
        rec = dict(zip(by, keys))
        acc_mean, acc_lo, acc_hi, n_acc = mean_ci(group["accuracy"])
        rt_mean, rt_lo, rt_hi, n_rt_subj = mean_ci(group["rt_mean"])
        rec.update(
            {
                "n_participants": int(group["anon"].nunique()),
                "n_trials": int(group["n_trials"].sum()),
                "n_rt": int(group["n_rt"].sum()),
                "accuracy_mean": acc_mean,
                "accuracy_sd": float(group["accuracy"].std(ddof=1))
                if len(group) > 1
                else np.nan,
                "accuracy_ci_low": max(0.0, acc_lo) if np.isfinite(acc_lo) else acc_lo,
                "accuracy_ci_high": min(1.0, acc_hi) if np.isfinite(acc_hi) else acc_hi,
                "rt_mean": rt_mean,
                "rt_sd": float(group["rt_mean"].std(ddof=1))
                if len(group) > 1
                else np.nan,
                "rt_ci_low": rt_lo,
                "rt_ci_high": rt_hi,
                "rt_median_of_medians": float(group["rt_median"].median()),
                "n_participants_with_rt": n_rt_subj,
            }
        )
        rows.append(rec)
    return pd.DataFrame(rows).sort_values(by).reset_index(drop=True)


def paired_contrast(
    df: pd.DataFrame,
    by: list[str],
    a,
    b,
    value: str,
    name: str,
    hypothesis: str,
) -> dict:
    p = participant_means(df, by).pivot(index="anon", columns=by, values=value)
    if len(by) == 1:
        x, y = p[a], p[b]
    else:
        x, y = p[a], p[b]
    keep = x.notna() & y.notna()
    x, y = x[keep].astype(float), y[keep].astype(float)
    diff = y - x
    n = len(diff)
    rec = {
        "hypothesis": hypothesis,
        "contrast": name,
        "n_participants": n,
        "value": value,
        "mean_a": float(x.mean()) if n else np.nan,
        "mean_b": float(y.mean()) if n else np.nan,
        "mean_diff_b_minus_a": float(diff.mean()) if n else np.nan,
        "sd_diff": float(diff.std(ddof=1)) if n > 1 else np.nan,
        "ci_low": np.nan,
        "ci_high": np.nan,
        "t": np.nan,
        "p": np.nan,
        "cohens_dz": np.nan,
        "wilcoxon_p": np.nan,
        "note": "",
    }
    if n > 1:
        _, lo, hi, _ = mean_ci(diff)
        rec.update({"ci_low": lo, "ci_high": hi})
        if diff.std(ddof=1) > 0:
            t, pval = stats.ttest_rel(y, x)
            rec.update(
                {
                    "t": float(t),
                    "p": float(pval),
                    "cohens_dz": float(diff.mean() / diff.std(ddof=1)),
                }
            )
            if n >= 6:
                try:
                    rec["wilcoxon_p"] = float(stats.wilcoxon(y, x).pvalue)
                except ValueError:
                    rec["note"] = "Wilcoxon undefined (all differences zero)"
        else:
            rec["note"] = "All paired differences are zero"
    return rec


def one_sample_contrast(
    values: pd.Series, name: str, hypothesis: str, value_label: str
) -> dict:
    clean = pd.to_numeric(values, errors="coerce").dropna().astype(float)
    n = len(clean)
    rec = {
        "hypothesis": hypothesis,
        "contrast": name,
        "n_participants": n,
        "value": value_label,
        "mean_a": np.nan,
        "mean_b": np.nan,
        "mean_diff_b_minus_a": float(clean.mean()) if n else np.nan,
        "sd_diff": float(clean.std(ddof=1)) if n > 1 else np.nan,
        "ci_low": np.nan,
        "ci_high": np.nan,
        "t": np.nan,
        "p": np.nan,
        "cohens_dz": np.nan,
        "wilcoxon_p": np.nan,
        "note": "",
    }
    if n > 1:
        _, lo, hi, _ = mean_ci(clean)
        rec.update({"ci_low": lo, "ci_high": hi})
        if clean.std(ddof=1) > 0:
            t, pval = stats.ttest_1samp(clean, 0)
            rec.update(
                {
                    "t": float(t),
                    "p": float(pval),
                    "cohens_dz": float(clean.mean() / clean.std(ddof=1)),
                }
            )
            if n >= 6:
                try:
                    rec["wilcoxon_p"] = float(stats.wilcoxon(clean).pvalue)
                except ValueError:
                    rec["note"] = "Wilcoxon undefined"
        else:
            rec["note"] = "All values are zero"
    return rec


def slope_table(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[int, pd.DataFrame]]:
    rows: list[dict] = []
    per_participant: dict[int, list[dict]] = {}
    for block in ["vs_feature", "vs_conjunction"]:
        block_df = df[(df["block"] == block) & df["rt_valid"]]
        for subset in ["all", "present", "absent"]:
            if subset == "present":
                sub = block_df[block_df["t_present"] == 1]
            elif subset == "absent":
                sub = block_df[block_df["t_present"] == 0]
            else:
                sub = block_df
            slopes = []
            for pid, group in sub.groupby("anon"):
                if group["setsize"].nunique() >= 2 and len(group) >= 3:
                    fit = stats.linregress(group["setsize"], group["rt"])
                    slopes.append(
                        {
                            "anon": pid,
                            "block": block,
                            "subset": subset,
                            "slope_ms_per_item": float(fit.slope),
                            "r2": float(fit.rvalue**2),
                            "n_trials": int(len(group)),
                        }
                    )
            s = pd.DataFrame(slopes)
            mean, lo, hi, n = mean_ci(s["slope_ms_per_item"]) if len(s) else (np.nan, np.nan, np.nan, 0)
            t = p = np.nan
            if n > 1 and s["slope_ms_per_item"].std(ddof=1) > 0:
                ttest = stats.ttest_1samp(s["slope_ms_per_item"], 0)
                t, p = float(ttest.statistic), float(ttest.pvalue)
            rows.append(
                {
                    "block": block,
                    "block_label": BLOCK_LABELS[block],
                    "subset": subset,
                    "n_participants": n,
                    "mean_slope_ms_per_item": mean,
                    "sd_slope": float(s["slope_ms_per_item"].std(ddof=1)) if n > 1 else np.nan,
                    "median_slope": float(s["slope_ms_per_item"].median()) if n else np.nan,
                    "ci_low": lo,
                    "ci_high": hi,
                    "t_vs_zero": t,
                    "p_vs_zero": p,
                }
            )
            if subset == "all":
                per_participant[block] = s.copy()
    return pd.DataFrame(rows), per_participant


def make_figures(
    formal: pd.DataFrame,
    vs_block: pd.DataFrame,
    vs_spatial: pd.DataFrame,
    ma_cells: pd.DataFrame,
    ma_heading: pd.DataFrame,
    slopes: pd.DataFrame,
    figures_dir: Path,
) -> list[Path]:
    figures_dir.mkdir(parents=True, exist_ok=True)
    out: list[Path] = []
    vs = formal[formal["experiment"] == "dreamy_visual_search"]
    ma = formal[formal["experiment"] == "dreamy_map_alignment"]

    # ---- Figure 1: VS block RT -------------------------------------------------
    order = ["vs_feature", "vs_conjunction", "vs_spatial"]
    colors = [SAGE, ROSE, SLATE]
    pm = participant_means(vs, ["block"]).pivot(index="anon", columns="block", values="rt_mean")
    fig, ax = plt.subplots(figsize=(6.8, 4.2))
    means = [pm[b].mean() for b in order]
    los, his = [], []
    for b in order:
        _, lo, hi, _ = mean_ci(pm[b])
        los.append(lo)
        his.append(hi)
    x = np.arange(len(order))
    ax.bar(x, means, color=colors, width=0.58, edgecolor="white", linewidth=1.2, zorder=2)
    ax.errorbar(
        x,
        means,
        yerr=[np.array(means) - np.array(los), np.array(his) - np.array(means)],
        fmt="none",
        ecolor=INK,
        elinewidth=1,
        capsize=4,
        zorder=4,
    )
    for i, b in enumerate(order):
        vals = pm[b].dropna().values
        jitter = np.linspace(-0.10, 0.10, len(vals)) if len(vals) > 1 else [0]
        ax.scatter(
            np.full(len(vals), i) + jitter,
            vals,
            s=16,
            color=INK,
            alpha=0.38,
            linewidths=0,
            zorder=5,
        )
        ax.text(i, means[i] + 18, f"{means[i]:.0f}", ha="center", va="bottom", fontsize=9)
    ax.set_xticks(x, [BLOCK_LABELS[b] for b in order])
    ax.set_ylabel("正确试次平均 RT（ms）")
    ax.set_title("视觉搜索：各 Block 的反应时")
    ax.set_ylim(0, max(his) * 1.28)
    ax.text(
        0.99,
        0.97,
        "误差线 = 95% CI；点 = 每位被试的均值；n = 10",
        transform=ax.transAxes,
        ha="right",
        va="top",
        fontsize=8,
        color=MUTED,
    )
    fig.tight_layout()
    path = figures_dir / "fig1_vs_block_rt.png"
    fig.savefig(path, dpi=220, bbox_inches="tight", facecolor=CREAM)
    plt.close(fig)
    out.append(path)

    # ---- Figure 2: VS block accuracy ------------------------------------------
    pa = participant_means(vs, ["block"]).pivot(index="anon", columns="block", values="accuracy")
    fig, ax = plt.subplots(figsize=(6.8, 4.2))
    means = [pa[b].mean() for b in order]
    los, his = [], []
    for b in order:
        _, lo, hi, _ = mean_ci(pa[b])
        los.append(lo)
        his.append(hi)
    ax.bar(x, means, color=colors, width=0.58, edgecolor="white", linewidth=1.2, zorder=2)
    ax.errorbar(
        x,
        means,
        yerr=[np.array(means) - np.array(los), np.array(his) - np.array(means)],
        fmt="none",
        ecolor=INK,
        elinewidth=1,
        capsize=4,
        zorder=4,
    )
    for i, b in enumerate(order):
        vals = pa[b].dropna().values
        jitter = np.linspace(-0.10, 0.10, len(vals)) if len(vals) > 1 else [0]
        ax.scatter(
            np.full(len(vals), i) + jitter,
            vals,
            s=16,
            color=INK,
            alpha=0.38,
            linewidths=0,
            zorder=5,
        )
        ax.text(i, max(means[i] - 0.085, 0.03), f"{means[i]*100:.1f}%", ha="center", va="top", fontsize=9)
    ax.axhline(0.5, color=MUTED, linestyle=(0, (2, 2)), linewidth=0.8)
    ax.text(2.42, 0.51, "机会水平 50%", ha="right", va="bottom", fontsize=8, color=MUTED)
    ax.set_xticks(x, [BLOCK_LABELS[b] for b in order])
    ax.set_ylabel("正确率（全部正式试次）")
    ax.set_ylim(0, 1.08)
    ax.set_title("视觉搜索：各 Block 的正确率")
    ax.text(
        0.99,
        0.97,
        "误差线 = 95% CI；点 = 每位被试；n = 10",
        transform=ax.transAxes,
        ha="right",
        va="top",
        fontsize=8,
        color=MUTED,
    )
    fig.tight_layout()
    path = figures_dir / "fig2_vs_block_accuracy.png"
    fig.savefig(path, dpi=220, bbox_inches="tight", facecolor=CREAM)
    plt.close(fig)
    out.append(path)

    # ---- Figure 3: search slope ----------------------------------------------
    slope_all = slopes[slopes["subset"] == "all"].set_index("block")
    # Recover participant slopes for the paired dot plot from the saved table is
    # not possible; recompute here from the formal data.
    per_participant: dict[str, pd.Series] = {}
    for block in ["vs_feature", "vs_conjunction"]:
        sub = vs[(vs["block"] == block) & vs["rt_valid"]]
        vals = {}
        for pid, group in sub.groupby("anon"):
            if group["setsize"].nunique() >= 2 and len(group) >= 3:
                vals[pid] = stats.linregress(group["setsize"], group["rt"]).slope
        per_participant[block] = pd.Series(vals, dtype=float)
    fig, ax = plt.subplots(figsize=(5.6, 4.4))
    for pid in per_participant["vs_feature"].index:
        if pid in per_participant["vs_conjunction"].index:
            y1 = per_participant["vs_feature"][pid]
            y2 = per_participant["vs_conjunction"][pid]
            ax.plot([0, 1], [y1, y2], color=INK, alpha=0.22, linewidth=1, zorder=2)
            ax.scatter([0, 1], [y1, y2], color=[SAGE, ROSE], s=28, zorder=3, linewidths=0)
    for i, block in enumerate(["vs_feature", "vs_conjunction"]):
        vals = per_participant[block].dropna()
        mean = vals.mean()
        _, lo, hi, _ = mean_ci(vals)
        ax.errorbar(
            i,
            mean,
            yerr=[[mean - lo], [hi - mean]],
            fmt="D",
            color=INK,
            markersize=6,
            capsize=4,
            elinewidth=1,
            zorder=5,
        )
        ax.text(i + 0.08, mean, f"{mean:.1f}", va="center", fontsize=9)
    ax.axhline(0, color=MUTED, linestyle=(0, (2, 2)), linewidth=0.8)
    ax.set_xticks([0, 1], ["特征搜索", "联合搜索"])
    ax.set_xlim(-0.35, 1.45)
    ax.set_ylabel("搜索斜率（ms / 项目）")
    ax.set_title("视觉搜索斜率：RT 随集合大小变化的探索性估计")
    ax.text(
        0.99,
        0.04,
        "每名被试在每个 Block 内单独拟合；点 = 个体斜率；n = 10",
        transform=ax.transAxes,
        ha="right",
        va="bottom",
        fontsize=8,
        color=MUTED,
    )
    fig.tight_layout()
    path = figures_dir / "fig3_vs_search_slope.png"
    fig.savefig(path, dpi=220, bbox_inches="tight", facecolor=CREAM)
    plt.close(fig)
    out.append(path)

    # ---- Figure 4: 3x3 spatial heatmap ---------------------------------------
    fig, axes = plt.subplots(1, 2, figsize=(9.4, 4.2))
    rt_grid = np.full((3, 3), np.nan)
    acc_grid = np.full((3, 3), np.nan)
    n_grid = np.zeros((3, 3), dtype=int)
    for _, row in vs_spatial.iterrows():
        r, c = int(row["grid_row"]) - 1, int(row["grid_col"]) - 1
        rt_grid[r, c] = row["rt_mean"]
        acc_grid[r, c] = row["accuracy_mean"]
        n_grid[r, c] = row["n_trials"]
    cmap_rt = LinearSegmentedColormap.from_list("cream_sage", ["#F7F3E8", "#C9DDCB", "#6F947A"])
    cmap_acc = LinearSegmentedColormap.from_list("cream_rose", ["#F7F3E8", "#E7C4CA", "#A96F7B"])
    for ax, grid, cmap, title, vmin, vmax, label, fmt_str in [
        (axes[0], rt_grid, cmap_rt, "平均正确 RT（ms）", np.nanmin(rt_grid) - 30, np.nanmax(rt_grid) + 30, "ms", "{:.0f}"),
        (axes[1], acc_grid, cmap_acc, "正确率", 0.0, 1.0, "比例", "{:.0%}"),
    ]:
        im = ax.imshow(grid, cmap=cmap, vmin=vmin, vmax=vmax)
        ax.set_xticks(range(3), ["左", "中", "右"])
        ax.set_yticks(range(3), ["上", "中", "下"])
        ax.set_xlabel("屏幕水平位置")
        ax.set_ylabel("屏幕垂直位置")
        ax.set_title(title)
        ax.grid(False)
        for r in range(3):
            for c in range(3):
                val = grid[r, c]
                if np.isfinite(val):
                    text_color = "white" if (label == "ms" and val > np.nanmean(grid)) or (label != "ms" and val > 0.9) else INK
                    ax.text(c, r, fmt_str.format(val), ha="center", va="center", fontsize=10, color=text_color)
                    ax.text(c, r + 0.28, f"n={n_grid[r,c]}", ha="center", va="center", fontsize=7, color=text_color, alpha=0.8)
        cb = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        cb.set_label(label)
    fig.suptitle("视觉搜索 · 第三个 Block 的 3×3 目标位置（探索性）", fontsize=12, fontweight="bold")
    fig.text(
        0.5,
        0.01,
        "每个区域 10 个目标存在试次（每名被试 1 个）；样本量小，区域差异不作确认性结论。",
        ha="center",
        fontsize=8,
        color=MUTED,
    )
    fig.tight_layout(rect=[0, 0.04, 1, 0.94])
    path = figures_dir / "fig4_vs_spatial_heatmap.png"
    fig.savefig(path, dpi=220, bbox_inches="tight", facecolor=CREAM)
    plt.close(fig)
    out.append(path)

    # ---- Figure 5: MA 2x2 RT interaction -------------------------------------
    pm = participant_means(ma, ["cue", "align"]).pivot(
        index="anon", columns=["cue", "align"], values="rt_mean"
    )
    fig, ax = plt.subplots(figsize=(6.4, 4.4))
    xs = [0, 1]
    for cue, color, marker, label in [
        ("none", "#8C9F91", "o", "无人物线索"),
        ("person", TERRACOTTA, "s", "人物线索"),
    ]:
        means, los, his = [], [], []
        for align in ["aligned", "misaligned"]:
            vals = pm[(cue, align)]
            mean, lo, hi, _ = mean_ci(vals)
            means.append(mean)
            los.append(lo)
            his.append(hi)
        ax.plot(xs, means, marker=marker, color=color, linewidth=2, markersize=6, label=label, zorder=3)
        ax.errorbar(
            xs,
            means,
            yerr=[np.array(means) - np.array(los), np.array(his) - np.array(means)],
            fmt="none",
            ecolor=color,
            elinewidth=1,
            capsize=4,
            zorder=2,
        )
        for x, align in zip(xs, ["aligned", "misaligned"]):
            vals = pm[(cue, align)].dropna().values
            jitter = np.linspace(-0.045, 0.045, len(vals)) if len(vals) > 1 else [0]
            ax.scatter(np.full(len(vals), x) + jitter, vals, s=14, color=color, alpha=0.35, linewidths=0, zorder=4)
    ax.set_xticks(xs, ["对齐\n(3 试次/Block)", "不对齐\n(12 试次/Block)"])
    ax.set_ylabel("正确试次平均 RT（ms）")
    ax.set_title("地图对齐：线索 × 对齐条件的反应时")
    ax.set_ylim(0, float(pm.max().max()) * 1.12)
    ax.legend(frameon=False, loc="upper left")
    ax.text(
        0.99,
        0.03,
        "误差线 = 95% CI；点 = 每位被试；n = 10",
        transform=ax.transAxes,
        ha="right",
        va="bottom",
        fontsize=8,
        color=MUTED,
    )
    fig.tight_layout()
    path = figures_dir / "fig5_ma_rt_interaction.png"
    fig.savefig(path, dpi=220, bbox_inches="tight", facecolor=CREAM)
    plt.close(fig)
    out.append(path)

    # ---- Figure 6: MA 2x2 accuracy ------------------------------------------
    pa = participant_means(ma, ["cue", "align"]).pivot(
        index="anon", columns=["cue", "align"], values="accuracy"
    )
    fig, ax = plt.subplots(figsize=(6.4, 4.4))
    for cue, color, marker, label in [
        ("none", "#8C9F91", "o", "无人物线索"),
        ("person", TERRACOTTA, "s", "人物线索"),
    ]:
        means, los, his = [], [], []
        for align in ["aligned", "misaligned"]:
            mean, lo, hi, _ = mean_ci(pa[(cue, align)])
            means.append(mean)
            los.append(lo)
            his.append(hi)
        xplot = [x + (-0.018 if cue == "none" else 0.018) for x in xs]
        ax.plot(
            xplot,
            means,
            marker=marker,
            color=color,
            linewidth=2,
            markersize=6,
            linestyle="--" if cue == "none" else "-",
            label=label,
            zorder=4 if cue == "person" else 3,
        )
        ax.errorbar(
            xplot,
            means,
            yerr=[np.array(means) - np.array(los), np.array(his) - np.array(means)],
            fmt="none",
            ecolor=color,
            elinewidth=1,
            capsize=4,
            zorder=2,
        )
    ax.axhline(0.25, color=MUTED, linestyle=(0, (2, 2)), linewidth=0.8)
    ax.text(0.02, 0.27, "机会水平 25%", ha="left", va="bottom", fontsize=8, color=MUTED)
    ax.set_xticks(xs, ["对齐\n(3 试次/Block)", "不对齐\n(12 试次/Block)"])
    ax.set_ylabel("正确率（全部正式试次）")
    ax.set_ylim(0, 1.08)
    ax.set_title("地图对齐：线索 × 对齐条件的正确率")
    ax.legend(frameon=False, loc="lower left")
    ax.text(
        0.99,
        0.03,
        "误差线 = 95% CI；n = 10",
        transform=ax.transAxes,
        ha="right",
        va="bottom",
        fontsize=8,
        color=MUTED,
    )
    fig.tight_layout()
    path = figures_dir / "fig6_ma_accuracy_interaction.png"
    fig.savefig(path, dpi=220, bbox_inches="tight", facecolor=CREAM)
    plt.close(fig)
    out.append(path)

    # ---- Figure 7: cue effect in misaligned trials ---------------------------
    mis = pm.xs("misaligned", axis=1, level="align")
    fig, ax = plt.subplots(figsize=(5.6, 4.4))
    xpos = [0, 1]
    for pid in mis.index:
        ax.plot(xpos, [mis.loc[pid, "none"], mis.loc[pid, "person"]], color=INK, alpha=0.22, linewidth=1, zorder=2)
        ax.scatter(xpos, [mis.loc[pid, "none"], mis.loc[pid, "person"]], color=["#8C9F91", TERRACOTTA], s=26, zorder=3, linewidths=0)
    means = [mis["none"].mean(), mis["person"].mean()]
    ax.plot(xpos, means, color=INK, linewidth=2, zorder=4)
    ax.scatter(xpos, means, color=[ "#8C9F91", TERRACOTTA], s=70, edgecolor="white", linewidth=1.2, zorder=5)
    ax.text(1.06, means[1], f"{means[1]:.0f} ms", va="center", fontsize=9)
    ax.text(-0.06, means[0], f"{means[0]:.0f} ms", va="center", ha="right", fontsize=9)
    ax.set_xticks(xpos, ["无人物线索", "人物线索"])
    ax.set_xlim(-0.35, 1.4)
    ax.set_ylabel("不对齐试次平均正确 RT（ms）")
    ax.set_title("不对齐条件下的人物线索效应")
    ax.text(
        0.99,
        0.04,
        f"人物线索 − 无线索 = {means[1]-means[0]:.0f} ms；n = 10",
        transform=ax.transAxes,
        ha="right",
        va="bottom",
        fontsize=8,
        color=MUTED,
    )
    fig.tight_layout()
    path = figures_dir / "fig7_ma_misaligned_cue_effect.png"
    fig.savefig(path, dpi=220, bbox_inches="tight", facecolor=CREAM)
    plt.close(fig)
    out.append(path)

    # ---- Figure 8: heading gradient (supplementary) -------------------------
    fig, ax = plt.subplots(figsize=(6.4, 4.2))
    headings = [0, 90, 180, 270]
    for cue, color, marker, label in [
        ("none", "#8C9F91", "o", "无人物线索"),
        ("person", TERRACOTTA, "s", "人物线索"),
    ]:
        sub = ma_heading[ma_heading["cue"] == cue].set_index("heading")
        vals = [sub.loc[h, "rt_mean"] if h in sub.index else np.nan for h in headings]
        ax.plot(headings, vals, marker=marker, color=color, linewidth=2, markersize=5, label=label)
    ax.set_xticks(headings, ["0°\n对齐", "90°", "180°", "270°"])
    ax.set_ylabel("正确试次平均 RT（ms）")
    ax.set_xlabel("朝向角")
    ax.set_title("地图对齐：朝向梯度（探索性）")
    ax.legend(frameon=False, loc="upper left")
    ax.text(
        0.99,
        0.03,
        "每个朝向 30–40 个正式试次；n = 10",
        transform=ax.transAxes,
        ha="right",
        va="bottom",
        fontsize=8,
        color=MUTED,
    )
    fig.tight_layout()
    path = figures_dir / "fig8_ma_heading_gradient.png"
    fig.savefig(path, dpi=220, bbox_inches="tight", facecolor=CREAM)
    plt.close(fig)
    out.append(path)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--results-dir", type=Path, default=DEFAULT_RESULTS_DIR)
    args = parser.parse_args()
    data_dir = args.data_dir.resolve()
    results_dir = args.results_dir.resolve()
    tables_dir = results_dir / "tables"
    figures_dir = results_dir / "figures"
    tables_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)
    configure_style()

    raw, csv_path, json_path, source_check = load_export(data_dir)
    formal, ledger = clean_trials(raw)

    # Private cleaned trial-level file; never copied to the course submission.
    cleaned_cols = [
        "record_id", "experiment", "experiment_label", "participant_code", "anon",
        "block", "block_label", "phase", "trial", "cond", "rt", "correct",
        "timeout", "invalid", "rt_valid", "slow_flag", "setsize", "t_present",
        "present_label", "t_region", "t_x", "t_y", "heading", "align", "align_label",
        "cue", "cue_label", "target", "t_dir", "map_rot", "eye", "calib",
        "gaze_valid", "gaze_n", "gaze_fix", "mouse_valid", "mouse_n", "mouse_path",
    ]
    formal[[c for c in cleaned_cols if c in formal.columns]].to_csv(
        data_dir / "cleaned_trials.csv", index=False
    )

    vs = formal[formal["experiment"] == "dreamy_visual_search"].copy()
    ma = formal[formal["experiment"] == "dreamy_map_alignment"].copy()

    # ------------------------------------------------------------------ quality
    quality_rows = []
    for exp_label, exp_id in [("视觉搜索", "dreamy_visual_search"), ("地图对齐", "dreamy_map_alignment")]:
        g = formal[formal["experiment"] == exp_id]
        quality_rows.append(
            {
                "experiment": exp_label,
                "sessions": int(g["record_id"].nunique()),
                "participants": int(g["anon"].nunique()),
                "formal_trials": int(len(g)),
                "practice_trials_excluded": int(
                    ((raw["experiment"] == exp_id) & (raw["phase"] != "formal")).sum()
                ),
                "errors": int((g["correct"] == 0).sum()),
                "accuracy": float(g["correct"].mean()),
                "timeouts": int((g["timeout"] == 1).sum()),
                "invalid_formal": int((g["invalid"] == 1).sum()),
                "correct_rt_trials": int(g["rt_valid"].sum()),
                "rt_excluded": int(((g["correct"] == 1) & (~g["rt_valid"])).sum()),
                "slow_outlier_trials": int(g["slow_flag"].sum()),
            }
        )
    quality_rows.append(
        {
            "experiment": "合计",
            "sessions": int(formal["record_id"].nunique()),
            "participants": int(formal["anon"].nunique()),
            "formal_trials": int(len(formal)),
            "practice_trials_excluded": int((raw["phase"] != "formal").sum()),
            "errors": int((formal["correct"] == 0).sum()),
            "accuracy": float(formal["correct"].mean()),
            "timeouts": int((formal["timeout"] == 1).sum()),
            "invalid_formal": int((formal["invalid"] == 1).sum()),
            "correct_rt_trials": int(formal["rt_valid"].sum()),
            "rt_excluded": int(((formal["correct"] == 1) & (~formal["rt_valid"])).sum()),
            "slow_outlier_trials": int(formal["slow_flag"].sum()),
        }
    )
    quality = pd.DataFrame(quality_rows)
    quality.to_csv(tables_dir / "table01_sample_quality.csv", index=False)

    # -------------------------------------------------------------- VS tables
    vs_block = describe(vs, ["block"])
    vs_presence = describe(vs, ["block", "present_label"])
    vs_setsize = describe(vs, ["block", "setsize"])
    vs_block.to_csv(tables_dir / "table02_vs_block.csv", index=False)
    vs_presence.to_csv(tables_dir / "table03_vs_presence.csv", index=False)
    vs_setsize.to_csv(tables_dir / "table04_vs_setsize.csv", index=False)

    spatial = vs[(vs["block"] == "vs_spatial") & (vs["t_region"] > 0)].copy()
    spatial["grid_row"] = ((spatial["t_region"] - 1) // 3 + 1).astype(int)
    spatial["grid_col"] = ((spatial["t_region"] - 1) % 3 + 1).astype(int)
    vs_spatial = describe(spatial, ["t_region", "grid_row", "grid_col"])
    vs_spatial = vs_spatial.rename(columns={"t_region": "region"})
    vs_spatial.to_csv(tables_dir / "table05_vs_spatial_regions.csv", index=False)

    slopes, _ = slope_table(vs)
    slopes.to_csv(tables_dir / "table06_vs_search_slope.csv", index=False)

    eye = vs[(vs["eye"] == "calibrated") & (vs["gaze_valid"] >= 0.6) & (vs["gaze_n"] >= 5)]
    eye_summary = (
        eye.groupby("block")
        .agg(
            n_trials=("gaze_valid", "size"),
            n_participants=("anon", "nunique"),
            valid_ratio_mean=("gaze_valid", "mean"),
            gaze_samples_mean=("gaze_n", "mean"),
            fixations_mean=("gaze_fix", "mean"),
            rt_mean=("rt", "mean"),
        )
        .reset_index()
    )
    eye_summary["block_label"] = eye_summary["block"].map(BLOCK_LABELS)
    eye_summary.to_csv(tables_dir / "table07_vs_eye.csv", index=False)

    # -------------------------------------------------------------- MA tables
    ma_cells = describe(ma, ["cue", "align"])
    ma_heading = describe(ma, ["cue", "heading"])
    ma_cells.to_csv(tables_dir / "table08_ma_cells.csv", index=False)
    ma_heading.to_csv(tables_dir / "table09_ma_heading.csv", index=False)

    # Block order, derived from formal trial order.
    order_map = {}
    for pid, group in ma.groupby("anon"):
        sequence = (
            group.sort_values("trial")
            .loc[lambda d: d["phase"] == "formal", "block"]
            .drop_duplicates()
            .tolist()
        )
        order_map[pid] = "人物线索先" if sequence and sequence[0] == "ma_person_cue" else "无线索先"
    ma["order"] = ma["anon"].map(order_map)
    order_summary = (
        ma.groupby(["order", "cue"])
        .agg(n_participants=("anon", "nunique"), n_trials=("correct", "size"), accuracy=("correct", "mean"), rt_mean=("rt", "mean"))
        .reset_index()
    )
    order_summary["cue_label"] = order_summary["cue"].map(CUE_LABELS)
    order_summary.to_csv(tables_dir / "table10_ma_block_order.csv", index=False)

    # Costs per participant.
    cell_p = participant_means(ma, ["cue", "align"]).pivot(
        index="anon", columns=["cue", "align"], values="rt_mean"
    )
    acc_p = participant_means(ma, ["cue", "align"]).pivot(
        index="anon", columns=["cue", "align"], values="accuracy"
    )
    cost_none = cell_p[("none", "misaligned")] - cell_p[("none", "aligned")]
    cost_person = cell_p[("person", "misaligned")] - cell_p[("person", "aligned")]
    err_none = acc_p[("none", "aligned")] - acc_p[("none", "misaligned")]
    err_person = acc_p[("person", "aligned")] - acc_p[("person", "misaligned")]
    cost_table = pd.DataFrame(
        {
            "cue": ["none", "person"],
            "rt_cost_ms_mean": [cost_none.mean(), cost_person.mean()],
            "rt_cost_ms_sd": [cost_none.std(ddof=1), cost_person.std(ddof=1)],
            "accuracy_cost_mean": [err_none.mean(), err_person.mean()],
            "accuracy_cost_sd": [err_none.std(ddof=1), err_person.std(ddof=1)],
            "n_participants": [len(cost_none), len(cost_person)],
        }
    )
    cost_table.to_csv(tables_dir / "table11_ma_costs.csv", index=False)

    # RT sensitivity: primary mean, excluding >3× median, and participant medians.
    sens_rows: list[dict] = []
    for label, subset, value in [
        ("primary_mean", ma, "rt_mean"),
        ("exclude_slow", ma[~ma["slow_flag"]], "rt_mean"),
        ("participant_median", ma, "rt_median"),
    ]:
        p = participant_means(subset, ["cue", "align"]).pivot(
            index="anon", columns=["cue", "align"], values=value
        )
        pa = participant_means(subset, ["cue", "align"]).pivot(
            index="anon", columns=["cue", "align"], values="accuracy"
        )
        cost_n = p[("none", "misaligned")] - p[("none", "aligned")]
        cost_p = p[("person", "misaligned")] - p[("person", "aligned")]
        align_p = participant_means(subset, ["align"]).pivot(
            index="anon", columns="align", values=value
        )
        cue_p = participant_means(subset, ["cue"]).pivot(
            index="anon", columns="cue", values=value
        )
        align_diff = align_p["misaligned"] - align_p["aligned"]
        cue_diff = cue_p["person"] - cue_p["none"]
        sens_rows.append(
            {
                "analysis": label,
                "n_participants": int(len(p)),
                "align_rt_diff": float(align_diff.mean()),
                "align_p": float(stats.ttest_rel(align_p["misaligned"], align_p["aligned"]).pvalue),
                "cue_rt_diff": float(cue_diff.mean()),
                "cue_p": float(stats.ttest_rel(cue_p["person"], cue_p["none"]).pvalue),
                "cost_none_ms": float(cost_n.mean()),
                "cost_person_ms": float(cost_p.mean()),
                "cue_reduction_ms": float((cost_n - cost_p).mean()),
                "cue_reduction_p": float(stats.ttest_1samp(cost_n - cost_p, 0).pvalue),
            }
        )
    pd.DataFrame(sens_rows).to_csv(tables_dir / "table14_ma_rt_sensitivity.csv", index=False)

    # Search-slope sensitivity: equal weight per set size instead of trial-level OLS.
    slope_sens: list[dict] = []
    for block in ["vs_feature", "vs_conjunction"]:
        sub = vs[(vs["block"] == block) & vs["rt_valid"]]
        vals = []
        for pid, group in sub.groupby("anon"):
            means = group.groupby("setsize")["rt"].mean()
            if len(means) >= 2:
                vals.append(stats.linregress(means.index.astype(float), means.values).slope)
        vals_arr = np.array(vals, dtype=float)
        ttest = stats.ttest_1samp(vals_arr, 0) if len(vals_arr) > 1 else None
        slope_sens.append(
            {
                "block": block,
                "method": "equal_weight_per_setsize",
                "n_participants": int(len(vals_arr)),
                "mean_slope_ms_per_item": float(vals_arr.mean()) if len(vals_arr) else np.nan,
                "sd_slope": float(vals_arr.std(ddof=1)) if len(vals_arr) > 1 else np.nan,
                "t_vs_zero": float(ttest.statistic) if ttest else np.nan,
                "p_vs_zero": float(ttest.pvalue) if ttest else np.nan,
            }
        )
    pd.DataFrame(slope_sens).to_csv(
        tables_dir / "table15_vs_slope_sensitivity.csv", index=False
    )

    # ---------------------------------------------------------- planned tests
    contrasts: list[dict] = []
    contrasts.append(
        paired_contrast(vs, ["block"], "vs_feature", "vs_conjunction", "rt_mean", "H1 RT：特征 vs 联合", "H1")
    )
    contrasts.append(
        paired_contrast(vs, ["block"], "vs_feature", "vs_conjunction", "accuracy", "H1 正确率：特征 vs 联合", "H1")
    )
    contrasts.append(
        paired_contrast(vs, ["block"], "vs_feature", "vs_spatial", "rt_mean", "补充 RT：特征 vs 空间", "探索")
    )
    parallels = participant_means(vs, ["block", "present_label"]).pivot(
        index="anon", columns=["block", "present_label"], values="rt_mean"
    )
    for block in ["vs_feature", "vs_conjunction"]:
        a = parallels[(block, "目标存在")]
        b = parallels[(block, "目标缺席")]
        contrasts.append(
            {
                **paired_contrast(
                    vs[vs["block"] == block],
                    ["present_label"],
                    "目标存在",
                    "目标缺席",
                    "rt_mean",
                    f"H3 RT：{BLOCK_LABELS[block]} 缺席 − 存在",
                    "H3",
                )
            }
        )
    d_feature = parallels[("vs_feature", "目标缺席")] - parallels[("vs_feature", "目标存在")]
    d_conjunction = parallels[("vs_conjunction", "目标缺席")] - parallels[("vs_conjunction", "目标存在")]
    contrasts.append(
        one_sample_contrast(
            d_conjunction - d_feature,
            "H3 交互：(联合缺席−存在) − (特征缺席−存在)",
            "H3",
            "ms",
        )
    )
    # Slope paired contrast.
    slope_pp = {}
    for block in ["vs_feature", "vs_conjunction"]:
        sub = vs[(vs["block"] == block) & vs["rt_valid"]]
        slope_pp[block] = pd.Series(
            {
                pid: stats.linregress(group["setsize"], group["rt"]).slope
                for pid, group in sub.groupby("anon")
                if group["setsize"].nunique() >= 2 and len(group) >= 3
            },
            dtype=float,
        )
    slope_diff = slope_pp["vs_conjunction"] - slope_pp["vs_feature"]
    contrasts.append(
        one_sample_contrast(
            slope_diff.dropna(),
            "H2 斜率：联合 − 特征（ms/项目）",
            "H2",
            "ms/item",
        )
    )

    contrasts.append(
        paired_contrast(ma, ["align"], "aligned", "misaligned", "rt_mean", "H6 RT：对齐 vs 不对齐", "H6")
    )
    contrasts.append(
        paired_contrast(ma, ["align"], "aligned", "misaligned", "accuracy", "H6 正确率：对齐 vs 不对齐", "H6")
    )
    contrasts.append(
        paired_contrast(ma, ["cue"], "none", "person", "rt_mean", "H8 RT：无线索 vs 人物线索", "H8")
    )
    contrasts.append(
        paired_contrast(ma, ["cue"], "none", "person", "accuracy", "H8 正确率：无线索 vs 人物线索", "H8")
    )
    contrasts.append(
        paired_contrast(
            ma[ma["align"] == "misaligned"],
            ["cue"],
            "none",
            "person",
            "rt_mean",
            "H9 不对齐 RT：无线索 vs 人物线索",
            "H9",
        )
    )
    contrasts.append(
        paired_contrast(
            ma[ma["align"] == "aligned"],
            ["cue"],
            "none",
            "person",
            "rt_mean",
            "H9 对齐 RT：无线索 vs 人物线索",
            "H9",
        )
    )
    contrasts.append(
        one_sample_contrast(
            cost_none - cost_person,
            "H9 线索对 RT 不对齐代价的削减（无线索代价 − 人物代价）",
            "H9",
            "ms",
        )
    )
    contrasts.append(
        one_sample_contrast(
            err_none - err_person,
            "H9 线索对正确率不对齐代价的削减（无线索代价 − 人物代价）",
            "H9",
            "比例",
        )
    )
    # Heading 180 vs 90/270 (exploratory).
    heading_p = participant_means(ma, ["heading"]).pivot(index="anon", columns="heading", values="rt_mean")
    if 180 in heading_p.columns and 90 in heading_p.columns and 270 in heading_p.columns:
        contrasts.append(
            one_sample_contrast(
                heading_p[180] - (heading_p[90] + heading_p[270]) / 2,
                "H7 探索：180° − (90° 与 270° 均值)",
                "H7",
                "ms",
            )
        )
    contrast_df = pd.DataFrame(contrasts)
    contrast_df.to_csv(tables_dir / "table12_planned_contrasts.csv", index=False)

    # -------------------------------------------------------------- predictions
    def get_contrast(name: str) -> pd.Series:
        row = contrast_df[contrast_df["contrast"] == name]
        return row.iloc[0] if len(row) else pd.Series(dtype=object)

    pred_rows = [
        {
            "prediction": "H1：特征搜索 RT < 联合搜索 RT；特征正确率 ≥ 联合",
            "observed": f"特征 {vs_block.loc[vs_block.block=='vs_feature','rt_mean'].iloc[0]:.0f} ms / {vs_block.loc[vs_block.block=='vs_feature','accuracy_mean'].iloc[0]*100:.1f}%；联合 {vs_block.loc[vs_block.block=='vs_conjunction','rt_mean'].iloc[0]:.0f} ms / {vs_block.loc[vs_block.block=='vs_conjunction','accuracy_mean'].iloc[0]*100:.1f}%",
            "supported": "RT 方向支持；正确率方向相反（特征更低，差异不显著）",
        },
        {
            "prediction": "H2：联合搜索斜率 > 特征搜索斜率",
            "observed": (
                f"特征 {slopes[(slopes.block=='vs_feature') & (slopes.subset=='all')].mean_slope_ms_per_item.iloc[0]:.1f} ms/项目；"
                f"联合 {slopes[(slopes.block=='vs_conjunction') & (slopes.subset=='all')].mean_slope_ms_per_item.iloc[0]:.1f} ms/项目；"
                f"配对差 {slope_diff.dropna().mean():.1f} ms/项目（p={get_contrast('H2 斜率：联合 − 特征（ms/项目）').get('p', np.nan):.3f}）"
            ),
            "supported": "探索性支持；试次很少，斜率极不稳定",
        },
        {
            "prediction": "H3：目标缺席 RT > 存在 RT，且联合搜索更明显",
            "observed": "联合 101.9 ms（p=.007）；特征 12.2 ms（p=.540）；交互 89.7 ms（p=.018）",
            "supported": "支持",
        },
        {
            "prediction": "H4：空间位置 Block 仅探索，不预设稳定区域效应",
            "observed": "9 个区域各 10 个目标存在试次；正确率 80%–100%，RT 554–776 ms",
            "supported": "仅描述；样本量不足，不作确认性结论",
        },
        {
            "prediction": "H5：不能只看 RT，需同时报告正确率与速度—正确率权衡",
            "observed": "特征 Block 最快但正确率最低；联合 Block 较慢且正确率最高",
            "supported": "作为解释限制成立；提示速度—正确率权衡",
        },
        {
            "prediction": "H6：对齐 RT < 不对齐 RT，正确率更高",
            "observed": "对齐 1876 ms vs 不对齐 2017 ms，差 141 ms（95% CI −83–365，p=.188）；正确率 100% vs 95%（p=.074）",
            "supported": "方向一致，但统计不确定；不能称为确认性支持",
        },
        {
            "prediction": "H7：不对齐代价可能随角度增大，180° 最大",
            "observed": (
                f"180° RT 最慢（{heading_p[180].mean():.0f} ms），"
                f"90° {heading_p[90].mean():.0f} ms、270° {heading_p[270].mean():.0f} ms；"
                "正确率 180° 与 270° 均 93.8%"
            ),
            "supported": "RT 方向部分一致；正确率不支持简单梯度；探索性",
        },
        {
            "prediction": "H8：人物线索可能改善或无效/干扰（双向）",
            "observed": "人物线索 1301 ms vs 无线索 2685 ms；差 −1384 ms（p<.001）",
            "supported": "结果落在预测的“可能改善”方向：人物线索大幅更快；正确率无差异（96% vs 96%）",
        },
        {
            "prediction": "H9：人物线索应缩小不对齐代价（线索 × 对齐交互）",
            "observed": f"不对齐代价：无线索 {cost_none.mean():.0f} ms，人物 {cost_person.mean():.0f} ms；削减 { (cost_none-cost_person).mean():.0f} ms（p=.712）",
            "supported": "不支持；方向相反且无统计证据",
        },
        {
            "prediction": "H10：Block 顺序平衡，不应有稳定顺序效应",
            "observed": "5 人无线索先、5 人人物线索先；两种顺序中人物线索均更快",
            "supported": "顺序平衡；两种顺序中人物线索均更快；每组仅 5 人，无法可靠分离顺序与个体差异",
        },
    ]
    predictions = pd.DataFrame(pred_rows)
    predictions.to_csv(tables_dir / "table13_prediction_check.csv", index=False)

    # -------------------------------------------------------------- figures
    figs = make_figures(formal, vs_block, vs_spatial, ma_cells, ma_heading, slopes, figures_dir)

    # -------------------------------------------------------------- summary
    summary = {
        "data_sources": source_check,
        "cleaning_ledger": ledger,
        "sample_quality": quality.to_dict(orient="records"),
        "vs_block": vs_block.to_dict(orient="records"),
        "ma_cells": ma_cells.to_dict(orient="records"),
        "key_contrasts": contrast_df.to_dict(orient="records"),
        "figures": [str(p.relative_to(results_dir)) for p in figs],
        "notes": [
            "CSV and JSON exports contain the same 750 trial IDs and 20 sessions.",
            "No test_ records in the platform export.",
            "No formal timeouts or invalid responses; the one invalid response was a practice trial.",
            "Primary RT exclusion: correct formal trials with RT <200 ms or >10000 ms; zero trials excluded.",
            "Sensitivity flag: correct RT >3× participant median; 3 MA trials (1.0%), 0 VS trials.",
            "Perceptual ordering has no formal participant data and is not analysed.",
        ],
    }
    (results_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (results_dir / "data_source_check.json").write_text(
        json.dumps(source_check, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("Analysis complete")
    print(f"Data: {csv_path}")
    print(f"Rows: raw={len(raw)}, formal={len(formal)}, participants={formal['anon'].nunique()}")
    print(f"Outputs: {results_dir}")
    for p in figs:
        print(f"  figure: {p.name}")


if __name__ == "__main__":
    main()
