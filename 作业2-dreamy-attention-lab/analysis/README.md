# 作业 2 数据分析目录

本目录保存 Dreamy Attention Lab 作业 2 的可复现分析脚本、聚合结果表和图片。**这里不包含任何原始参与者数据。**

## 1. 数据来源

分析只使用课程作业数据平台（项目码 `TYJKZF`）导出的两份文件：

- 逐试次 CSV
- 嵌套会话 JSON

两份文件覆盖相同的 20 个会话、750 个试次，试次 ID 与会话 ID 完全一致。项目本地 SQLite 数据库用于交叉核对来源，但其中没有与本次导出匹配的 `DCL-` 匿名编号；本地库主要是开发 / E2E 会话，因此**未进入任何统计**。详见 `data_source_check.json`。

> 说明：课程仓库不包含本地 `data/lab.db`。如果从课程目录运行脚本，`data_source_check.json` 的 `local_sqlite` 字段会是 `null`，这不影响任何统计；仓库中已提交的版本是在独立开发项目中运行并包含本地库核对结果的版本。

原始导出文件应放在：

```text
analysis/private-data/
```

该目录已被 `.gitignore` 排除，不得提交到 GitHub。脚本只读取原始文件，不会修改它们；清洗后的逐试次表 `cleaned_trials.csv` 也写回该忽略目录。

## 2. 复现方法

建议使用 Python 3.12：

```bash
cd 作业2-dreamy-attention-lab
python -m venv analysis/.venv
# Windows
analysis/.venv/Scripts/python.exe -m pip install -r analysis/requirements.txt
# macOS / Linux
# analysis/.venv/bin/python -m pip install -r analysis/requirements.txt

analysis/.venv/Scripts/python.exe analysis/analyze_hw2.py \
  --data-dir analysis/private-data \
  --results-dir analysis
```

`--results-dir analysis` 会把图片写入 `analysis/figures/`、表格写入 `analysis/tables/`，并覆盖 `analysis/summary.json` 与 `analysis/data_source_check.json`，与仓库中已提交的聚合结果一致。本次提交前已用同一命令在新目录复跑，`figures/` 与 `tables/` 逐文件比对完全一致；`summary.json` / `data_source_check.json` 中只有本地 SQLite 核对字段会因课程目录没有 `data/lab.db` 而不同。

脚本会自动寻找 `private-data/` 中的 CSV 与 JSON，并显式排除自己生成的 `cleaned_trials.csv`。如果缺少文件或字段，脚本会报错，不会补齐或伪造数据。

## 3. 清洗与统计口径

- 排除 `test_` 记录与练习试次；练习试次保留在原始文件中，但不进入正式统计。
- 按匿名编号 `anon` 识别参与者；同一参与者的多个会话合并，不把重复会话算成新被试。
- 正确率使用全部正式试次；超时、未作答和错误均计入分母。
- 正确反应时（RT）只使用：正确、未超时、按键有效、`200 ≤ RT ≤ 10000 ms` 的试次。
- 慢试次敏感性检查：以每位参与者自身正确 RT 中位数的 3 倍为界，标记但**不纳入主分析排除**；另行报告排除后的结果。
- 先按参与者计算条件均值，再做配对检验；报告均值、标准差、95% CI、Cohen's dz 与 Wilcoxon 符号秩检验作为稳健性参考。
- 不对多重比较作过度声明；探索性分析在 README 与图表中明确标注。

## 4. 文件说明

| 文件 | 内容 |
| --- | --- |
| `analyze_hw2.py` | 完整清洗、统计、绘图脚本 |
| `requirements.txt` | 固定版本依赖 |
| `summary.json` | 主要统计量的机器可读汇总 |
| `data_source_check.json` | CSV / JSON / 本地 SQLite 的来源核对 |
| `figures/fig1_vs_block_rt.png` | 视觉搜索三个 Block 的正确 RT |
| `figures/fig2_vs_block_accuracy.png` | 视觉搜索三个 Block 的正确率 |
| `figures/fig3_vs_search_slope.png` | 特征 / 联合搜索的集合大小斜率 |
| `figures/fig4_vs_spatial_heatmap.png` | 空间位置 Block 的 3 × 3 目标区域描述图 |
| `figures/fig5_ma_rt_interaction.png` | 地图对齐 2 × 2 RT 交互 |
| `figures/fig6_ma_accuracy_interaction.png` | 地图对齐 2 × 2 正确率交互 |
| `figures/fig7_ma_misaligned_cue_effect.png` | 不对齐条件下人物线索效应 |
| `figures/fig8_ma_heading_gradient.png` | 朝向角 RT 与正确率描述 |
| `tables/table01_sample_quality.csv` | 样本量、正式试次、排除与准确性 |
| `tables/table02`–`table07` | 视觉搜索 Block、目标存在性、集合大小、空间区域、斜率、眼动描述 |
| `tables/table08`–`table11` | 地图对齐 2 × 2 单元、朝向、Block 顺序、不对齐代价 |
| `tables/table12_planned_contrasts.csv` | 计划对比的完整统计量 |
| `tables/table13_prediction_check.csv` | H1–H10 逐条核对 |
| `tables/table14_ma_rt_sensitivity.csv` | 地图对齐 RT 的排除 / 中位数敏感性分析 |
| `tables/table15_vs_slope_sensitivity.csv` | 每个集合大小等权的斜率敏感性分析 |

## 5. 隐私

- 不提交 `analysis/private-data/`、`analysis/.venv/`、`analysis/results/`、数据库或任何含匿名编号的逐试次文件。
- 图表与表格只包含条件聚合值，不包含单个参与者的可识别信息。
- 课程 README 只报告匿名汇总结果，不报告姓名、学号、联系方式或原始摄像头数据。
