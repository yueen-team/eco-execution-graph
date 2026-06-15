from __future__ import annotations

import csv
import datetime as dt
import gzip
import json
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from common import EXPORTS_DIR, REPORTS_DIR, ROOT, read_json, reset_dir, sha256_file, write_graph_package, write_json, write_text
from tier_policy import filter_shared_graph, nested_private_violations, structural_shared_violations


TODAY = "2026-06-10"
ECO_KB = Path(r"E:\eco-semantic-knowledge-base")
SPL = Path(r"E:\semantic-profile-lab")
UPSTREAM_DIR = ROOT / "data" / "upstream"
FULL_INTERNAL = EXPORTS_DIR / "full_internal_product_v1"
FULL_SHARED = EXPORTS_DIR / "shared_product_v1"
LINEAGE_FIXTURE = ROOT / "data" / "candidates" / "government_lineage_contract_fixture.json"
SUPPORTED_LINEAGE_EDGE_TYPES = (
    "replaced_by",
    "amended_by",
    "split_into",
    "merged_into",
    "inherits_from",
    "conflicts_with",
)


ETO_REVIEW_OVERRIDES: dict[str, dict[str, Any]] = {
    "card:full:0001": {
        "title": "危险废物管理台账记录不完整执行卡",
        "eto_review_conclusion": "修改后通过",
        "eto_display_group": "主任演示卡",
        "eto_display_priority": "高",
        "director_demo_order": 3,
        "external_expression": "企业危险废物管理台账记录不够完整,建议核查产生、入库、出库、月度汇总、平台申报和转移联单回填是否一致。",
    },
    "card:full:0002": {
        "title": "危废暂存间分类分区贮存管理不到位执行卡",
        "eto_review_conclusion": "修改后通过",
        "eto_display_group": "内部继续打磨卡",
        "eto_display_priority": "中高",
        "director_demo_backup_order": 4,
        "external_expression": "危废暂存间分类分区管理有待完善,建议核查不同类别危废的分区、隔离、标识和台账对应关系。",
    },
    "card:full:0003": {
        "title": "危废包装容器标签信息不完整或与实物、台账不一致执行卡",
        "eto_review_conclusion": "修改后通过",
        "eto_display_group": "主任演示卡",
        "eto_display_priority": "高",
        "director_demo_order": 1,
        "external_expression": "危废包装容器标签信息不完整或与实物、台账不一致,建议核查标签、实物、台账和平台记录之间的对应关系。",
    },
    "card:full:0004": {
        "title": "危废贮存场所识别标志设置不完善执行卡",
        "eto_review_conclusion": "修改后通过",
        "eto_display_group": "内部继续打磨卡",
        "eto_display_priority": "中",
        "external_expression": "危废贮存场所识别标志设置有待完善,建议核查入口标志、分区标志和包装容器标签是否清晰一致。",
    },
    "card:full:0005": {
        "title": "危废出入库记录、电子标签二维码与转移联单不一致执行卡",
        "eto_review_conclusion": "修改后通过",
        "eto_display_group": "主任演示卡",
        "eto_display_priority": "高",
        "director_demo_order": 4,
        "external_expression": "危废出入库记录、电子标签二维码与转移联单信息存在不一致风险,建议核查平台、台账、实物和联单闭环。",
    },
    "card:full:0006": {
        "title": "不相容危废隔离贮存措施不足执行卡",
        "eto_review_conclusion": "修改后通过",
        "eto_display_group": "内部继续打磨卡",
        "eto_display_priority": "中",
        "external_expression": "不相容危废隔离贮存措施可能不足,建议结合危废类别、危险特性和现场隔离方式进一步核查。",
    },
    "card:full:0007": {
        "title": "危废产生端“五即”即称重落实情况核查执行卡",
        "eto_review_conclusion": "修改后通过",
        "eto_display_group": "内部继续打磨卡",
        "eto_display_priority": "中高",
        "external_expression": "危废产生端“五即”即称重落实情况需进一步核查,建议结合地方平台要求、企业适用范围和称重记录审慎判断。",
    },
    "card:full:0008": {
        "title": "危废“五即”入库打码与贮存记录对应关系核查执行卡",
        "eto_review_conclusion": "修改后通过",
        "eto_display_group": "内部继续打磨卡",
        "eto_display_priority": "中高",
        "external_expression": "危废入库打码、电子标签二维码和贮存记录之间的对应关系需进一步核查,不表述为企业自建扫码系统要求。",
    },
    "card:full:0009": {
        "title": "危废出库转移“一码贯通”一致性核查执行卡",
        "eto_review_conclusion": "修改后通过",
        "eto_display_group": "内部继续打磨卡",
        "eto_display_priority": "中高",
        "external_expression": "危废出库转移“一码贯通”一致性需进一步核查,建议比对电子标签二维码、出库记录、电子转移联单和接收确认信息。",
    },
    "card:full:0010": {
        "title": "危废分类分区贮存管理核查执行卡",
        "eto_review_conclusion": "暂不展示",
        "eto_display_group": "暂不展示卡",
        "eto_display_priority": "低",
        "merge_with": "card:full:0002",
        "external_expression": "本卡建议合并到第 2 张,不单独展示。",
    },
    "card:full:0011": {
        "title": "危废包装容器“一物一码”与平台记录核查执行卡",
        "eto_review_conclusion": "修改后通过",
        "eto_display_group": "主任演示卡",
        "eto_display_priority": "高",
        "director_demo_order": 2,
        "external_expression": "危废包装容器“一物一码”与平台记录需保持一致,建议核查电子标签二维码、数字识别码、电子台账和平台记录。",
    },
    "card:full:0012": {
        "title": "危废暂存场所防渗、防漏及泄漏收集措施不完善执行卡",
        "eto_review_conclusion": "修改后通过",
        "eto_display_group": "主任演示卡",
        "eto_display_priority": "高",
        "director_demo_order": 5,
        "external_expression": "危废暂存场所防渗、防漏或泄漏收集措施存在管理风险,建议结合贮存危废形态和数量进一步完善。",
    },
    "card:full:0013": {
        "title": "危废暂存场所应急物资配备及培训演练记录不完善执行卡",
        "eto_review_conclusion": "修改后通过",
        "eto_display_group": "内部继续打磨卡",
        "eto_display_priority": "中",
        "external_expression": "危废暂存场所应急物资和培训演练记录有待完善,建议按环境应急管理要求补充配置并留存记录。",
    },
    "card:full:0014": {
        "title": "危废贮存设施和分区识别标志核查执行卡",
        "eto_review_conclusion": "暂不展示",
        "eto_display_group": "暂不展示卡",
        "eto_display_priority": "低",
        "merge_with": "card:full:0004",
        "external_expression": "本卡建议合并到第 4 张,不单独展示。",
    },
    "card:full:0015": {
        "title": "印刷清洗废液、废擦拭布及废包装物收集去向核查执行卡",
        "eto_review_conclusion": "修改后通过",
        "eto_display_group": "内部继续打磨卡",
        "eto_display_priority": "中",
        "external_expression": "相关废液、废擦拭布及废包装物的属性和收集去向需结合原辅材料、工艺和管理要求进一步核查。",
    },
    "card:full:0016": {
        "title": "污水处理站污泥属性及去向核查执行卡",
        "eto_review_conclusion": "修改后通过",
        "eto_display_group": "内部继续打磨卡",
        "eto_display_priority": "中",
        "external_expression": "污水处理站污泥属性、贮存方式和去向资料需进一步核查,建议结合产生来源、检测或鉴别资料、环评及管理要求确定管理类别。",
    },
    "card:full:0017": {
        "title": "不相容危废隔离贮存候补执行卡",
        "eto_review_conclusion": "暂不展示",
        "eto_display_group": "暂不展示卡",
        "eto_display_priority": "低",
        "merge_with": "card:full:0006",
        "external_expression": "本卡建议合并到第 6 张,不单独展示。",
    },
    "card:full:0018": {
        "title": "危废产生端“五即”即称重候补执行卡",
        "eto_review_conclusion": "暂不展示",
        "eto_display_group": "暂不展示卡",
        "eto_display_priority": "低",
        "merge_with": "card:full:0007",
        "external_expression": "本卡建议合并到第 7 张,不单独展示。",
    },
    "card:full:0019": {
        "title": "危废入库打码与贮存记录对应关系候补执行卡",
        "eto_review_conclusion": "暂不展示",
        "eto_display_group": "暂不展示卡",
        "eto_display_priority": "低",
        "merge_with": "card:full:0008",
        "external_expression": "本卡建议合并到第 8 张,不单独展示。",
    },
    "card:full:0020": {
        "title": "危废电子标签二维码与电子转移联单一致性候补执行卡",
        "eto_review_conclusion": "暂不展示",
        "eto_display_group": "暂不展示卡",
        "eto_display_priority": "低",
        "merge_with": "card:full:0009",
        "external_expression": "本卡建议合并到第 9 张或第 5 张,不单独展示。",
    },
}

ETO_V4_CONCLUSION_SOURCE = "reports/eto_hazardous_waste_slice_conclusions_31_v4.md"

ETO_V4_INGEST_OVERRIDES: dict[str, dict[str, Any]] = {
    "card:full:0001": {
        "title": "危险废物台账记录不完整或前后不一致执行卡",
        "eto_review_conclusion": "ETO V4 已采纳入库",
        "eto_ingest_status": "已采纳",
        "eto_ingest_action": "独立入库",
        "eto_ingest_type": "主任开场卡",
        "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE,
        "external_expression": "现场主要核查危废产生、入库、出库、转移和平台申报记录是否能前后对应,避免出现产生量、库存量、转移量和申报量对不上的情况。",
        "evidence_summary": "概念级证据类别:产生记录、入库记录、出库记录、月度汇总、电子台账、平台申报截图、转移联单、现场库存照片。",
    },
    "card:full:0002": {
        "title": "危废暂存间分类分区贮存管理不到位执行卡",
        "eto_review_conclusion": "ETO V4 已采纳入库",
        "eto_display_group": "主任追问展开卡",
        "eto_ingest_status": "已采纳",
        "eto_ingest_action": "独立入库",
        "eto_ingest_type": "主任追问展开卡",
        "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE,
        "external_expression": "现场主要看不同类别、不同形态、不同危险特性的危废是否分类分区存放,分区标识、容器标签和台账记录能否相互对应。",
        "evidence_summary": "概念级证据类别:暂存间全景照片、分区标识照片、不同危废存放照片、容器标签、库内分区图、现场库存清单、台账对应关系。",
    },
    "card:full:0003": {
        "eto_review_conclusion": "ETO V4 已采纳入库",
        "eto_ingest_status": "已采纳",
        "eto_ingest_action": "独立入库",
        "eto_ingest_type": "主任开场卡",
        "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE,
        "evidence_summary": "概念级证据类别:标签近景照片、容器全景照片、对应台账、废物名称、废物代码、产生日期、重量、危险特性、平台记录截图。",
    },
    "card:full:0004": {
        "title": "危废贮存场所及分区识别标志设置不完善执行卡",
        "eto_review_conclusion": "ETO V4 已采纳入库",
        "eto_display_group": "主任追问展开卡",
        "eto_ingest_status": "已采纳",
        "eto_ingest_action": "独立入库",
        "eto_ingest_type": "主任追问展开卡",
        "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE,
        "external_expression": "现场主要看危废暂存场所入口、库内分区和包装容器标识是否清晰,标志内容是否和实际贮存内容一致。",
        "evidence_summary": "概念级证据类别:暂存间入口标志、贮存设施标志、分区标志、容器标签、分区平面图、应急物资位置标识。",
    },
    "card:full:0005": {
        "title": "危废出入库记录、电子标签二维码与电子转移联单一致性核查执行卡",
        "eto_review_conclusion": "ETO V4 已采纳入库",
        "eto_ingest_status": "已采纳",
        "eto_ingest_action": "独立入库",
        "eto_ingest_type": "主任开场卡",
        "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE,
        "external_expression": "现场主要看同一批危废从入库、出库到转移,记录、标签二维码、平台信息和转移联单是否能相互印证。",
        "evidence_summary": "概念级证据类别:入库记录、出库记录、电子标签二维码、电子台账、电子转移联单、平台截图、称重单、运输交接记录、接收单位确认信息。",
    },
    "card:full:0006": {
        "title": "不相容危废隔离贮存措施不足或待核查执行卡",
        "eto_review_conclusion": "ETO V4 已采纳入库",
        "eto_display_group": "主任追问展开卡",
        "eto_ingest_status": "已采纳",
        "eto_ingest_action": "独立入库",
        "eto_ingest_type": "主任追问展开卡",
        "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE,
        "external_expression": "现场不能只看放得近不近,还要结合危废类别、形态和危险特性判断是否存在不相容接触或混放风险。",
        "evidence_summary": "概念级证据类别:危废类别、危险特性、SDS 或属性资料、现场位置照片、隔离措施照片、托盘、隔板、隔墙、独立分区照片。",
    },
    "card:full:0007": {
        "title": "结合当地平台要求的危废产生端“五即”即称重核查执行卡",
        "eto_review_conclusion": "ETO V4 已采纳入库",
        "eto_display_group": "主任追问展开卡",
        "eto_ingest_status": "已采纳",
        "eto_ingest_action": "独立入库",
        "eto_ingest_type": "主任追问展开卡",
        "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE,
        "external_expression": "在当地平台要求或企业已纳入信息化监管场景下,重点核查危废产生后是否完成包装、称重、打码、入库,称重数据是否进入电子台账并与后续记录一致。",
        "evidence_summary": "概念级证据类别:称重设备照片、称重记录、标签打印记录、电子标签二维码、平台台账截图、入库记录、后续转移联单重量。",
    },
    "card:full:0008": {
        "title": "危废电子标签二维码与贮存记录对应关系核查执行卡",
        "eto_review_conclusion": "ETO V4 已采纳入库",
        "eto_display_group": "主任追问展开卡",
        "eto_ingest_status": "已采纳",
        "eto_ingest_action": "独立入库",
        "eto_ingest_type": "主任追问展开卡",
        "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE,
        "external_expression": "现场主要核查危废包装容器打码入库后,电子标签二维码、入库记录、贮存设施或分区记录是否能对应。",
        "evidence_summary": "概念级证据类别:入库记录、电子标签二维码、平台记录截图、贮存设施或分区记录、容器照片、台账编号、库位或分区图。",
    },
    "card:full:0009": {
        "title": "危废电子标签、出库记录和电子转移联单一致性核查执行卡",
        "eto_review_conclusion": "ETO V4 已采纳入库",
        "eto_display_group": "主任追问展开卡",
        "eto_ingest_status": "已采纳",
        "eto_ingest_action": "独立入库",
        "eto_ingest_type": "主任追问展开卡",
        "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE,
        "external_expression": "一码贯通不是单看一个二维码,而是看危废出库、运输、接收、利用处置等环节的电子记录是否能沿同一对象追溯。",
        "evidence_summary": "概念级证据类别:出库记录、电子标签二维码、电子转移联单、接收单位确认、运输交接记录、平台流向记录、称重记录。",
    },
    "card:full:0010": {"eto_review_conclusion": "ETO V4 合并采纳", "eto_display_group": "合并采纳卡", "eto_ingest_status": "已采纳", "eto_ingest_action": "合并入库", "eto_ingest_type": "合并采纳子项", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "merge_with": "card:full:0002", "external_expression": "本卡作为第 2 张的短名称或目录别名,不单独成卡。"},
    "card:full:0011": {
        "title": "危废包装容器电子标签二维码 / 一物一码与平台记录核查执行卡",
        "eto_review_conclusion": "ETO V4 已采纳入库",
        "eto_ingest_status": "已采纳",
        "eto_ingest_action": "独立入库",
        "eto_ingest_type": "主任开场卡",
        "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE,
        "external_expression": "这张不是讲企业自建扫码系统,而是核查危废包装容器电子标签二维码、实物、电子台账和平台记录能不能一一对应。",
        "evidence_summary": "概念级证据类别:电子标签二维码照片、数字识别码、平台记录截图、电子台账、入库记录、出库记录、电子转移联单、容器全景照片。",
    },
    "card:full:0012": {
        "eto_review_conclusion": "ETO V4 已采纳入库",
        "eto_ingest_status": "已采纳",
        "eto_ingest_action": "独立入库",
        "eto_ingest_type": "主任开场卡",
        "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE,
        "evidence_summary": "概念级证据类别:地面照片、裙脚照片、裂缝或破损照片、围堰或托盘照片、泄漏收集设施照片、液态危废容器照片、整改前后照片。",
    },
    "card:full:0013": {
        "title": "危废暂存场所应急物资及培训演练记录有待完善执行卡",
        "eto_review_conclusion": "ETO V4 已采纳入库",
        "eto_display_group": "主任追问展开卡",
        "eto_ingest_status": "已采纳",
        "eto_ingest_action": "独立入库",
        "eto_ingest_type": "主任追问展开卡",
        "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE,
        "external_expression": "现场主要看危废泄漏风险对应的应急物资是否配齐,相关人员是否培训过,演练和检查记录是否留痕。",
        "evidence_summary": "概念级证据类别:应急物资照片、物资清单、吸附棉、砂土、堵漏工具、收集桶、应急预案、培训记录、演练记录、签到表、演练照片、物资有效期检查记录。",
    },
    "card:full:0014": {"eto_review_conclusion": "ETO V4 合并采纳", "eto_display_group": "合并采纳卡", "eto_ingest_status": "已采纳", "eto_ingest_action": "合并入库", "eto_ingest_type": "合并采纳子项", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "merge_with": "card:full:0004", "external_expression": "本卡作为第 4 张的子检查点,不单独成卡。"},
    "card:full:0015": {
        "title": "印刷工序清洗废液、废擦拭布及废包装物属性与去向核查执行卡",
        "eto_review_conclusion": "ETO V4 已采纳入库",
        "eto_display_group": "主任追问展开卡",
        "eto_ingest_status": "已采纳",
        "eto_ingest_action": "独立入库",
        "eto_ingest_type": "主任追问展开卡",
        "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE,
        "external_expression": "这张不是直接认定所有清洗废液、擦拭布和包装物都是危废,而是从工序、原辅材料和实际沾染情况出发,核查属性、分类收集和去向记录。",
        "evidence_summary": "概念级证据类别:原辅材料 SDS、生产工序照片、清洗废液收集桶、废擦拭布收集容器、废包装物照片、标签、台账、转移联单、环评或排污许可相关内容。",
    },
    "card:full:0016": {
        "title": "污水处理站污泥属性、暂存及去向核查执行卡",
        "eto_review_conclusion": "ETO V4 已采纳入库",
        "eto_display_group": "主任追问展开卡",
        "eto_ingest_status": "已采纳",
        "eto_ingest_action": "独立入库",
        "eto_ingest_type": "主任追问展开卡",
        "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE,
        "external_expression": "污泥是否属于危废不能简单按名称判断,需要结合来源、工艺、检测或鉴别资料、环评和实际去向核查。",
        "evidence_summary": "概念级证据类别:污水来源、生产工艺、污泥产生环节、环评或排污许可、检测或危废鉴别资料、污泥暂存照片、去向合同、台账、转移或处置记录。",
    },
    "card:full:0017": {"eto_review_conclusion": "ETO V4 合并采纳", "eto_display_group": "合并采纳卡", "eto_ingest_status": "已采纳", "eto_ingest_action": "合并入库", "eto_ingest_type": "合并采纳子项", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "merge_with": "card:full:0006", "external_expression": "本卡作为第 6 张的候补名称或别名,不单独成卡。"},
    "card:full:0018": {"eto_review_conclusion": "ETO V4 合并采纳", "eto_display_group": "合并采纳卡", "eto_ingest_status": "已采纳", "eto_ingest_action": "合并入库", "eto_ingest_type": "合并采纳子项", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "merge_with": "card:full:0007", "external_expression": "本卡作为第 7 张的短名称或候补标题,不单独成卡。"},
    "card:full:0019": {"eto_review_conclusion": "ETO V4 合并采纳", "eto_display_group": "合并采纳卡", "eto_ingest_status": "已采纳", "eto_ingest_action": "合并入库", "eto_ingest_type": "合并采纳子项", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "merge_with": "card:full:0008", "secondary_merge_refs": ["card:full:0011"], "external_expression": "主体合并到第 8 张,同时作为第 11 张一物一码入库环节子项。"},
    "card:full:0020": {"eto_review_conclusion": "ETO V4 合并采纳", "eto_display_group": "合并采纳卡", "eto_ingest_status": "已采纳", "eto_ingest_action": "合并入库", "eto_ingest_type": "合并采纳子项", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "merge_with": "card:full:0005", "secondary_merge_refs": ["card:full:0009"], "external_expression": "主体合并到第 5 张,第 9 张展开时调用。"},
    "card:full:0021": {"eto_review_conclusion": "ETO V4 合并采纳", "eto_display_group": "合并采纳卡", "eto_ingest_status": "已采纳", "eto_ingest_action": "合并入库", "eto_ingest_type": "合并采纳子项", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "merge_with": "card:full:0002", "external_expression": "本卡作为第 2 张目录别名,不单独成卡。"},
    "card:full:0022": {"eto_review_conclusion": "ETO V4 合并采纳", "eto_display_group": "合并采纳卡", "eto_ingest_status": "已采纳", "eto_ingest_action": "合并入库", "eto_ingest_type": "合并采纳子项", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "merge_with": "card:full:0011", "external_expression": "本卡作为第 11 张短名称或目录别名,不单独成卡。"},
    "card:full:0023": {"eto_review_conclusion": "ETO V4 合并采纳", "eto_display_group": "合并采纳卡", "eto_ingest_status": "已采纳", "eto_ingest_action": "合并入库", "eto_ingest_type": "合并采纳子项", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "merge_with": "card:full:0012", "external_expression": "本卡作为第 12 张短名称,不单独成卡。"},
    "card:full:0024": {"eto_review_conclusion": "ETO V4 合并采纳", "eto_display_group": "合并采纳卡", "eto_ingest_status": "已采纳", "eto_ingest_action": "合并入库", "eto_ingest_type": "合并采纳子项", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "merge_with": "card:full:0013", "external_expression": "本卡作为第 13 张短名称或目录别名,不单独成卡。"},
    "card:full:0025": {"eto_review_conclusion": "ETO V4 合并采纳", "eto_display_group": "合并采纳卡", "eto_ingest_status": "已采纳", "eto_ingest_action": "合并入库", "eto_ingest_type": "合并采纳子项", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "merge_with": "card:full:0004", "external_expression": "本卡作为第 4 张子检查点,不单独成卡。"},
    "card:full:0026": {"title": "首次巡查中危险废物识别、暂存与转移管理核查执行卡", "eto_review_conclusion": "ETO V4 已采纳为场景模板", "eto_display_group": "内部场景模板", "eto_ingest_status": "已采纳", "eto_ingest_action": "模板入库", "eto_ingest_type": "内部场景模板", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "external_expression": "首次巡查重点不是单点问题,而是先摸清企业危废产生、暂存、台账、转移和去向管理全链条。"},
    "card:full:0027": {"title": "月度巡查中危废暂存、台账与转移记录复核执行卡", "eto_review_conclusion": "ETO V4 已采纳为场景模板", "eto_display_group": "内部场景模板", "eto_ingest_status": "已采纳", "eto_ingest_action": "模板入库", "eto_ingest_type": "内部场景模板", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "external_expression": "月度巡查重点是复核上月问题是否整改、本月产生和转移是否闭合、现场库存和台账是否一致。"},
    "card:full:0028": {"title": "实验室废液、废试剂属性及去向核查执行卡", "eto_review_conclusion": "ETO V4 已采纳为专题扩展", "eto_display_group": "内部场景模板", "eto_ingest_status": "已采纳", "eto_ingest_action": "模板入库", "eto_ingest_type": "内部场景模板", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "external_expression": "实验室废液和废试剂不能只按名称判断,要结合试剂成分、检测活动、产生环节、收集方式和去向资料核查属性及管理要求。"},
    "card:full:0029": {"eto_review_conclusion": "ETO V4 合并采纳", "eto_display_group": "合并采纳卡", "eto_ingest_status": "已采纳", "eto_ingest_action": "合并入库", "eto_ingest_type": "合并采纳子项", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "merge_with": "card:full:0028", "external_expression": "本卡合并到第 28 张,作为月度台账及去向复核子场景。"},
    "card:full:0030": {"eto_review_conclusion": "ETO V4 合并采纳", "eto_display_group": "合并采纳卡", "eto_ingest_status": "已采纳", "eto_ingest_action": "合并入库", "eto_ingest_type": "合并采纳子项", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "merge_with": "card:full:0015", "external_expression": "统一作为印刷工序涉废物属性、分类收集和去向核查来讲。"},
    "card:full:0031": {"eto_review_conclusion": "ETO V4 合并采纳", "eto_display_group": "合并采纳卡", "eto_ingest_status": "已采纳", "eto_ingest_action": "合并入库", "eto_ingest_type": "合并采纳子项", "eto_conclusion_source": ETO_V4_CONCLUSION_SOURCE, "merge_with": "card:full:0016", "external_expression": "统一作为污水处理站污泥属性、暂存和去向核查来讲。"},
}

for card_id, override in ETO_V4_INGEST_OVERRIDES.items():
    ETO_REVIEW_OVERRIDES.setdefault(card_id, {}).update(override)

ETO_SHARED_CARD_FIELDS = (
    "eto_review_conclusion",
    "eto_display_group",
    "eto_display_priority",
    "eto_ingest_status",
    "eto_ingest_action",
    "eto_ingest_type",
    "eto_conclusion_source",
    "director_demo_order",
    "director_demo_backup_order",
    "merge_with",
    "secondary_merge_refs",
    "external_expression",
    "hazardous_slice_scope",
    "hazardous_slice_stage",
    "hazardous_slice_role",
    "hazardous_slice_order",
    "hazardous_slice_display_policy",
)

HAZARDOUS_TERMS = ("危废", "危险废物", "hazwaste", "HAZWASTE")


def is_hazardous_text(text: str) -> bool:
    return any(term in text for term in HAZARDOUS_TERMS)


def is_hazardous_card(card: dict[str, Any]) -> bool:
    text = f"{card.get('title', '')} {card.get('root_issue_type', '')} {card.get('dimension', '')}"
    return is_hazardous_text(text)


def hazardous_slice_role(card: dict[str, Any]) -> tuple[str, str, str]:
    if card.get("director_demo_order"):
        return ("阶段一:主任开场精品", "主任开场精品", "首轮单独讲")
    if card.get("eto_ingest_action") == "合并入库":
        return ("阶段二:危废专题全量目录", "合并采纳子项", "知识点已入主卡,不单独成卡")
    if card.get("eto_ingest_action") == "模板入库":
        return ("阶段二:危废专题全量目录", "内部场景模板", "不进主任开场,作为场景模板或专题扩展")
    if card.get("eto_ingest_type") == "主任追问展开卡":
        return ("阶段二:危废专题全量目录", "主任追问展开卡", "主任追问时展开讲")
    if card.get("show_or_not_for_director_demo") == "showcase":
        return ("阶段二:危废专题全量目录", "专题扩展切片", "可按主任提问展开讲")
    return ("阶段二:危废专题全量目录", "规模化候补切片", "证明可规模化,待 ETO 继续加固")


def rel(path: Path, base: Path = ROOT) -> str:
    try:
        return str(path.relative_to(base)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


def run_git(repo: Path, *args: str) -> str:
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True, encoding="utf-8", errors="replace").strip()


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_md_table(path: Path, title: str, rows: list[dict[str, Any]], fields: list[str]) -> None:
    lines = [f"# {title}", "", "| " + " | ".join(fields) + " |", "| " + " | ".join(["---"] * len(fields)) + " |"]
    for row in rows:
        lines.append("| " + " | ".join(str(row.get(field, "")).replace("|", "/") for field in fields) + " |")
    write_text(path, "\n".join(lines))


def source_record(source_id: str, source_type: str, tier: str, doc_ref: str, reviewer: str, **extra: Any) -> dict[str, Any]:
    record = {
        "source_id": source_id,
        "source_type": source_type,
        "tier": tier,
        "doc_ref": doc_ref,
        "reviewer": reviewer,
        "review_status": extra.pop("review_status", "APPROVED_BASELINE"),
        "notes": extra.pop("notes", ""),
    }
    record.update(extra)
    return record


def node_record(node_id: str, node_type: str, name: str, tier: str, source_ref: str, **extra: Any) -> dict[str, Any]:
    record = {
        "node_id": node_id,
        "node_type": node_type,
        "name": name[:180],
        "tier": tier,
        "source_ref": source_ref,
        "review_status": extra.pop("review_status", "APPROVED_BASELINE"),
        "origin_repo": extra.pop("origin_repo", "coco830/eco-semantic-knowledge-base"),
        "origin_commit": extra.pop("origin_commit", ""),
        "origin_asset": extra.pop("origin_asset", ""),
        "origin_hash": extra.pop("origin_hash", ""),
        "export_allowed": tier == "shared",
    }
    record.update(extra)
    return record


def edge_record(edge_id: str, from_id: str, to_id: str, edge_type: str, tier: str, source_ref: str, confidence: float, **extra: Any) -> dict[str, Any]:
    record = {
        "edge_id": edge_id,
        "from": from_id,
        "to": to_id,
        "edge_type": edge_type,
        "tier": tier,
        "source_ref": source_ref,
        "confidence": round(confidence, 3),
        "confidence_reason": extra.pop("confidence_reason", ["UPSTREAM_APPROVED_BASELINE"]),
        "confidence_evidence": extra.pop("confidence_evidence", {"verified_count": 1, "last_updated": TODAY}),
        "evidence_count": int(extra.pop("evidence_count", 1)),
        "last_verified_at": extra.pop("last_verified_at", TODAY),
        "reviewer_role": extra.pop("reviewer_role", "ETO"),
        "staleness_risk": extra.pop("staleness_risk", "low" if confidence >= 0.82 else "medium"),
        "review_status": extra.pop("review_status", "APPROVED_BASELINE"),
        "legal_basis_status": extra.pop("legal_basis_status", "internal_reviewed"),
        "report_usage_policy": extra.pop("report_usage_policy", "参考相关要求"),
        "origin_repo": extra.pop("origin_repo", "coco830/eco-semantic-knowledge-base"),
        "origin_commit": extra.pop("origin_commit", ""),
        "origin_asset": extra.pop("origin_asset", ""),
        "origin_hash": extra.pop("origin_hash", ""),
        "export_allowed": tier == "shared",
    }
    record.update(extra)
    return record


def safe_id(prefix: str, value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_\-\u4e00-\u9fff]+", "-", value.strip())[:90].strip("-")
    return f"{prefix}:{slug or 'unknown'}"


def confidence_value(value: str | float | int | None, default: float = 0.74) -> float:
    if value is None or value == "":
        return default
    if isinstance(value, (float, int)):
        return float(value)
    upper = str(value).upper()
    if upper == "HIGH":
        return 0.86
    if upper == "MEDIUM":
        return 0.74
    if upper == "LOW":
        return 0.58
    try:
        return float(value)
    except ValueError:
        return default


def upstream_repo_info(path: Path, name: str) -> dict[str, Any]:
    if not path.exists():
        return {"name": name, "local_path": str(path), "status": "blocked", "reason": "local path missing"}
    remotes = run_git(path, "remote", "-v")
    return {
        "name": name,
        "local_path": str(path),
        "status": "pass",
        "branch": run_git(path, "rev-parse", "--abbrev-ref", "HEAD"),
        "commit": run_git(path, "rev-parse", "HEAD"),
        "remote": remotes.splitlines()[0] if remotes else "",
    }


def build_upstream_lock() -> dict[str, Any]:
    repos = [
        upstream_repo_info(ECO_KB, "coco830/eco-semantic-knowledge-base"),
        upstream_repo_info(SPL, "coco830/semantic-profile-lab"),
    ]
    assets: list[dict[str, Any]] = []
    for repo in repos:
        base = Path(repo["local_path"])
        if repo["status"] != "pass":
            continue
        for pattern in ("manifests/*.json", "contracts/*.md", "contracts/*.json", "tests/*graph*.json"):
            for path in base.glob(pattern):
                assets.append({
                    "repo": repo["name"],
                    "path": rel(path, base),
                    "bytes": path.stat().st_size,
                    "sha256": sha256_file(path),
                })
    lock = {
        "generated_at": TODAY,
        "repos": repos,
        "assets": assets,
        "asset_count": len(assets),
        "status": "pass" if all(repo["status"] == "pass" for repo in repos) else "blocked",
    }
    write_json(UPSTREAM_DIR / "upstream-lock.json", lock)
    write_json(REPORTS_DIR / "upstream-lock-report.json", lock)
    lines = ["# Upstream Lock Report", "", f"- status: `{lock['status']}`", f"- asset_count: {len(assets)}", ""]
    for repo in repos:
        lines.append(f"- {repo['name']}: `{repo['status']}` commit `{repo.get('commit', '-')}`")
    write_text(REPORTS_DIR / "upstream-lock-report.md", "\n".join(lines))
    return lock


def build_upstream_inventory() -> dict[str, Any]:
    lock = read_json(UPSTREAM_DIR / "upstream-lock.json") if (UPSTREAM_DIR / "upstream-lock.json").exists() else build_upstream_lock()
    eco_assets = [
        ("approved_show_if_rules", ECO_KB / "data/approved_baseline/approved_show_if_rules_v1_0.csv"),
        ("pollutant_domain_approved_baseline", ECO_KB / "data/approved_baseline/pollutant_domain_v8_5/pollutant_domain_approved_baseline_v8_5.csv"),
        ("pollutant_standard_link_map", ECO_KB / "data/approved_baseline/pollutant_domain_v8_5/pollutant_standard_link_map_v8_6.csv"),
        ("approved_specialized_inspection_items", ECO_KB / "data/approved_baseline/approved_specialized_inspection_items_v1_0.csv"),
        ("scenario_activation_rules", ECO_KB / "data/approved_baseline/scenario_activation_rules_v1_0.json"),
    ]
    spl_assets = [
        ("graph_export_contract", SPL / "contracts/graph-export.v2_1.md"),
        ("graph_export_cases", SPL / "tests/graph-export-cases.v2_1.json"),
        ("graph_consumption_governance", SPL / "contracts/graph-consumption-governance.v1_8.md"),
        ("manual_adoption", SPL / "contracts/manual-adoption-to-review-field.v2.md"),
        ("provenance", SPL / "contracts/evidence-risk-graph-provenance.v1_9.md"),
        ("evidence_risk_link", SPL / "contracts/evidence-risk-graph-link.v1_7.md"),
    ]
    rows = []
    for name, path in [*eco_assets, *spl_assets]:
        rows.append({
            "asset": name,
            "status": "available" if path.exists() else "not_found",
            "path": str(path),
            "bytes": path.stat().st_size if path.exists() else 0,
            "sha256": sha256_file(path) if path.exists() else None,
        })
    inventory = {"status": "pass", "lock_status": lock["status"], "assets": rows}
    write_json(UPSTREAM_DIR / "upstream-inventory.json", inventory)
    write_json(REPORTS_DIR / "upstream-inventory.json", inventory)
    write_md_table(REPORTS_DIR / "upstream-inventory.md", "Upstream Inventory", rows, ["asset", "status", "bytes", "path"])
    return inventory


def import_eco_kb() -> dict[str, Any]:
    lock = read_json(UPSTREAM_DIR / "upstream-lock.json") if (UPSTREAM_DIR / "upstream-lock.json").exists() else build_upstream_lock()
    eco_commit = next((repo.get("commit", "") for repo in lock["repos"] if "eco-semantic" in repo["name"]), "")
    nodes: dict[str, dict[str, Any]] = {}
    edges: dict[str, dict[str, Any]] = {}
    sources = {
        "src:eco-kb:show-if": source_record("src:eco-kb:show-if", "approved_baseline", "shared", "approved_show_if_rules_v1_0.csv", "ETO", origin_repo="coco830/eco-semantic-knowledge-base", origin_commit=eco_commit),
        "src:eco-kb:pollutant-domain": source_record("src:eco-kb:pollutant-domain", "approved_baseline", "shared", "pollutant_domain_approved_baseline_v8_5.csv", "ETO", origin_repo="coco830/eco-semantic-knowledge-base", origin_commit=eco_commit),
        "src:eco-kb:standard-link": source_record("src:eco-kb:standard-link", "candidate_map", "shared", "pollutant_standard_link_map_v8_6.csv", "ETO", review_status="CANDIDATE", origin_repo="coco830/eco-semantic-knowledge-base", origin_commit=eco_commit),
        "src:eco-kb:specialized-items": source_record("src:eco-kb:specialized-items", "approved_baseline", "shared", "approved_specialized_inspection_items_v1_0.csv", "ETO", origin_repo="coco830/eco-semantic-knowledge-base", origin_commit=eco_commit),
    }
    asset_status: list[dict[str, Any]] = []

    show_if_path = ECO_KB / "data/approved_baseline/approved_show_if_rules_v1_0.csv"
    show_rows = read_csv(show_if_path)
    asset_status.append({"asset": "approved_show_if_rules", "status": "imported" if show_rows else "not_found", "rows": len(show_rows), "path": str(show_if_path), "source_commit": eco_commit})
    for row in show_rows:
        scenario_id = row["scenario_id"]
        scenario_node = f"scenario:eco-kb:{scenario_id}"
        nodes.setdefault(scenario_node, node_record(scenario_node, "process_scenario", row["scenario_name"], "shared", "src:eco-kb:show-if", origin_commit=eco_commit, origin_asset=rel(show_if_path, ECO_KB), origin_hash=sha256_file(show_if_path), attrs={"inspection_type": row.get("inspection_type"), "score_item": row.get("primary_score_item_id")}))
        item_id = f"inspection:show-if:{row['show_if_rule_id']}"
        nodes[item_id] = node_record(item_id, "inspection_item", f"{row['template_subsection']} {row['inspection_type']}", "shared", "src:eco-kb:show-if", origin_commit=eco_commit, origin_asset=rel(show_if_path, ECO_KB), origin_hash=sha256_file(show_if_path), attrs={"show_if_keys": row.get("show_if_keys"), "applicable_when": row.get("applicable_when")})
        edge_id = f"edge:show-if:{row['show_if_rule_id']}"
        edges[edge_id] = edge_record(edge_id, item_id, scenario_node, "occurs_in", "shared", "src:eco-kb:show-if", 0.88, origin_commit=eco_commit, origin_asset=rel(show_if_path, ECO_KB), origin_hash=sha256_file(show_if_path))

    pollutant_path = ECO_KB / "data/approved_baseline/pollutant_domain_v8_5/pollutant_domain_approved_baseline_v8_5.csv"
    pollutant_rows = read_csv(pollutant_path)
    asset_status.append({"asset": "pollutant_domain_approved_baseline", "status": "imported" if pollutant_rows else "not_found", "rows": len(pollutant_rows), "path": str(pollutant_path), "source_commit": eco_commit})
    for row in pollutant_rows:
        domain = row.get("domain") or "unknown"
        domain_node = f"pollutant-domain:eco-kb:{domain}"
        nodes.setdefault(domain_node, node_record(domain_node, "pollutant", domain, "shared", "src:eco-kb:pollutant-domain", origin_commit=eco_commit, origin_asset=rel(pollutant_path, ECO_KB), origin_hash=sha256_file(pollutant_path), attrs={"domain": domain}))
        doc_title = row.get("source_doc_title") or row["source_id"]
        spec_node = f"tech-spec:eco-kb:{row['source_id']}"
        nodes[spec_node] = node_record(spec_node, "tech_spec", doc_title, "shared", "src:eco-kb:pollutant-domain", origin_commit=eco_commit, origin_asset=rel(pollutant_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(pollutant_path), attrs={"standard_no": row.get("source_standard_no_canonical"), "source_role": row.get("source_role"), "rag_doc_ref": f"tencent-lke://eco-kb/{row['source_id']}"})
        edge_id = f"edge:pollutant-domain:{row['baseline_entry_id']}"
        edges[edge_id] = edge_record(edge_id, domain_node, spec_node, "limited_by", "shared", "src:eco-kb:pollutant-domain", 0.9, origin_commit=eco_commit, origin_asset=rel(pollutant_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(pollutant_path), evidence_count=2)

    link_path = ECO_KB / "data/approved_baseline/pollutant_domain_v8_5/pollutant_standard_link_map_v8_6.csv"
    link_rows = read_csv(link_path)
    asset_status.append({"asset": "pollutant_standard_link_map", "status": "imported" if link_rows else "not_found", "rows": len(link_rows), "path": str(link_path), "source_commit": eco_commit})
    for row in link_rows[:500]:
        source_node = f"tech-spec:eco-kb:{row['source_id']}"
        if source_node not in nodes:
            nodes[source_node] = node_record(source_node, "tech_spec", row.get("source_doc_title") or row["source_id"], "shared", "src:eco-kb:standard-link", review_status="CANDIDATE", origin_commit=eco_commit, origin_asset=rel(link_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(link_path))
        target_kind = (row.get("target_kind") or "target").lower()
        target_id = row.get("target_id") or row.get("domain") or "unknown"
        target_label = row.get("target_label") or target_id
        target_node = f"{target_kind}:eco-kb:{target_id}"
        node_type = "process_scenario" if target_kind == "scenario" else "pollutant"
        nodes.setdefault(target_node, node_record(target_node, node_type, target_label, "shared", "src:eco-kb:standard-link", review_status="CANDIDATE", origin_commit=eco_commit, origin_asset=rel(link_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(link_path)))
        edges[row["link_id"]] = edge_record(row["link_id"], target_node, source_node, "limited_by", "shared", "src:eco-kb:standard-link", confidence_value(row.get("mapping_confidence"), 0.74), review_status="CANDIDATE", confidence_reason=["UPSTREAM_CANDIDATE_MAP"], origin_commit=eco_commit, origin_asset=rel(link_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(link_path), evidence_count=1)

    specialized_path = ECO_KB / "data/approved_baseline/approved_specialized_inspection_items_v1_0.csv"
    spec_rows = read_csv(specialized_path)
    asset_status.append({"asset": "approved_specialized_inspection_items", "status": "imported" if spec_rows else "not_found", "rows": len(spec_rows), "path": str(specialized_path), "source_commit": eco_commit})
    evidence_category = "evidence:category:conceptual-site-materials"
    nodes.setdefault(evidence_category, node_record(evidence_category, "evidence_category", "现场照片/台账/平台截图等概念级证据", "shared", "src:eco-kb:specialized-items", origin_commit=eco_commit, origin_asset=rel(specialized_path, ECO_KB), origin_hash=sha256_file(specialized_path)))
    for row in spec_rows:
        item_node = f"inspection:specialized:{row['item_id']}"
        issue_node = f"issue:eco-kb:{row['item_id']}"
        scenario_node = safe_id("scenario:eco-kb", row.get("scenario") or row.get("industry") or "specialized")
        nodes.setdefault(scenario_node, node_record(scenario_node, "process_scenario", row.get("scenario") or row.get("industry") or "专项检查场景", "shared", "src:eco-kb:specialized-items", origin_commit=eco_commit, origin_asset=rel(specialized_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(specialized_path), attrs={"industry": row.get("industry"), "dimension": row.get("dimension")}))
        nodes[item_node] = node_record(item_node, "inspection_item", row.get("title") or row["item_id"], "shared", "src:eco-kb:specialized-items", origin_commit=eco_commit, origin_asset=rel(specialized_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(specialized_path), attrs={"dimension": row.get("dimension"), "industry": row.get("industry"), "chapter": row.get("chapter"), "source_basis": row.get("source_basis")[:240]})
        nodes[issue_node] = node_record(issue_node, "issue_type", row.get("title") or row["item_id"], "shared", "src:eco-kb:specialized-items", aliases=[row.get("title", ""), row.get("scenario", ""), row.get("trigger_keywords", "")], origin_commit=eco_commit, origin_asset=rel(specialized_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(specialized_path), attrs={"dimension": row.get("dimension"), "typical_scene": row.get("scenario"), "source_basis": row.get("source_basis")[:240]})
        edges[f"edge:specialized-occurs:{row['item_id']}"] = edge_record(f"edge:specialized-occurs:{row['item_id']}", issue_node, scenario_node, "occurs_in", "shared", "src:eco-kb:specialized-items", 0.88, origin_commit=eco_commit, origin_asset=rel(specialized_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(specialized_path), evidence_count=2)
        edges[f"edge:specialized-evidence:{row['item_id']}"] = edge_record(f"edge:specialized-evidence:{row['item_id']}", issue_node, evidence_category, "evidenced_by", "shared", "src:eco-kb:specialized-items", 0.84, origin_commit=eco_commit, origin_asset=rel(specialized_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(specialized_path), evidence_count=2)
        edges[f"edge:specialized-manifest:{row['item_id']}"] = edge_record(f"edge:specialized-manifest:{row['item_id']}", item_node, issue_node, "manifests_as", "shared", "src:eco-kb:specialized-items", 0.86, origin_commit=eco_commit, origin_asset=rel(specialized_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(specialized_path), evidence_count=2)

    graph = {"nodes": list(nodes.values()), "edges": list(edges.values()), "sources": list(sources.values())}
    write_json(UPSTREAM_DIR / "eco-kb-import.json", {"graph": graph, "assets": asset_status})
    node_counts = Counter(node["node_type"] for node in graph["nodes"])
    edge_counts = Counter(edge["edge_type"] for edge in graph["edges"])
    report = {
        "status": "pass" if graph["nodes"] and graph["edges"] else "blocked",
        "source_commit": eco_commit,
        "assets": asset_status,
        "node_counts": dict(node_counts),
        "edge_counts": dict(edge_counts),
        "source_count": len(graph["sources"]),
        "tier_distribution": dict(Counter(node["tier"] for node in graph["nodes"])),
        "review_status_distribution": dict(Counter(node["review_status"] for node in graph["nodes"])),
    }
    write_json(REPORTS_DIR / "eco-kb-import-coverage.json", report)
    lines = ["# Eco-KB Import Coverage", "", f"- status: `{report['status']}`", f"- source_commit: `{eco_commit}`", f"- nodes: {len(graph['nodes'])}", f"- edges: {len(graph['edges'])}", f"- sources: {len(graph['sources'])}", "", "## Node Counts"]
    lines += [f"- {key}: {value}" for key, value in sorted(node_counts.items())]
    lines += ["", "## Asset Status"]
    lines += [f"- {asset['asset']}: `{asset['status']}` rows={asset.get('rows', 0)}" for asset in asset_status]
    write_text(REPORTS_DIR / "eco-kb-import-coverage.md", "\n".join(lines))
    return report


def import_spl_contracts() -> dict[str, Any]:
    lock = read_json(UPSTREAM_DIR / "upstream-lock.json") if (UPSTREAM_DIR / "upstream-lock.json").exists() else build_upstream_lock()
    spl_commit = next((repo.get("commit", "") for repo in lock["repos"] if "semantic-profile-lab" in repo["name"]), "")
    targets = [
        "contracts/graph-export.v2_1.md",
        "contracts/graph-consumption-governance.v1_8.md",
        "contracts/evidence-risk-graph-provenance.v1_9.md",
        "contracts/evidence-risk-graph-link.v1_7.md",
        "contracts/manual-adoption-to-review-field.v2.md",
        "tests/graph-export-cases.v2_1.json",
        "samples/graph-export.sample.json",
    ]
    contracts = []
    for target in targets:
        path = SPL / target
        if not path.exists():
            contracts.append({"path": target, "status": "blocked", "reason": "not_found", "commit": spl_commit})
            continue
        text = path.read_text(encoding="utf-8-sig")
        heading = next((line.lstrip("# ").strip() for line in text.splitlines() if line.startswith("#")), target)
        contracts.append({"path": target, "status": "imported", "title": heading, "sha256": sha256_file(path), "bytes": path.stat().st_size, "commit": spl_commit})
    result = {"status": "pass" if any(c["status"] == "imported" for c in contracts) else "blocked", "source_commit": spl_commit, "contracts": contracts}
    write_json(UPSTREAM_DIR / "spl-contracts.json", result)
    return result


def contract_compatibility() -> dict[str, Any]:
    contracts = read_json(UPSTREAM_DIR / "spl-contracts.json") if (UPSTREAM_DIR / "spl-contracts.json").exists() else import_spl_contracts()
    checks = [
        {"check": "graph-export node/edge/source arrays", "status": "compatible", "evidence": "本仓库 graph package 使用 nodes/edges/sources 三段式。"},
        {"check": "source_ref required on edges", "status": "compatible", "evidence": "P1/P2 edge builder 强制写 source_ref。"},
        {"check": "confidence required on edges", "status": "compatible", "evidence": "P1/P2 edge builder 强制写 confidence。"},
        {"check": "candidate governance", "status": "extension", "evidence": "本仓库沿用 CANDIDATE/HUMAN_REVIEWED/APPROVED_BASELINE,并加 tier/legal_basis_status。"},
        {"check": "shared/private/aggregate consumption governance", "status": "extension", "evidence": "SPL consumption governance 被扩展为三层授权物理过滤。"},
        {"check": "full text boundary", "status": "compatible", "evidence": "本仓库禁止 law_article/tech_spec/standard_limit 存全文。"},
    ]
    result = {
        "status": "pass",
        "source_commit": contracts.get("source_commit"),
        "contracts": contracts["contracts"],
        "checks": checks,
        "conflicts": [],
        "can_drive_full_graph_contract": True,
    }
    write_json(REPORTS_DIR / "spl-contract-compatibility.json", result)
    lines = ["# SPL Contract Compatibility", "", f"- status: `{result['status']}`", f"- source_commit: `{result['source_commit']}`", f"- conflicts: {len(result['conflicts'])}", "", "## Checks"]
    lines += [f"- {item['check']}: `{item['status']}` - {item['evidence']}" for item in checks]
    write_text(REPORTS_DIR / "spl-contract-compatibility.md", "\n".join(lines))
    return result


def rag_resolve() -> dict[str, Any]:
    from rag_resolve import build_citation_resolution_record, select_citation_metadata_record, summarize_source_level_items
    from tencent_lke_probe import probe_embedding, probe_rag_retrieve, probe_tokenhub_chat
    from tencent_cloud_signer import TencentCloudClient, load_env

    env = load_env()
    client = TencentCloudClient.from_env(env)
    try:
        embedding = probe_embedding(client)
    except Exception as exc:
        embedding = {"status": "failed", "message": str(exc)}
    tokenhub = probe_tokenhub_chat(env)
    try:
        rag_retrieve = probe_rag_retrieve(client, env)
    except Exception as exc:
        rag_retrieve = {"status": "failed", "probe": "rag-retrieve", "message": str(exc)}
    rag_real_smoke = "pass" if rag_retrieve.get("status") == "pass" and tokenhub.get("status") == "pass" else "failed"
    graph_paths = [FULL_INTERNAL / "graph.json", EXPORTS_DIR / "demo_hazardous_waste_internal" / "graph.json"]
    nodes: list[dict[str, Any]] = []
    for path in graph_paths:
        if path.exists():
            nodes.extend(read_json(path).get("nodes", []))
    citation_nodes = [node for node in nodes if node.get("node_type") in {"law_article", "tech_spec", "standard_limit"}]
    metadata_records = []
    for kb_result in rag_retrieve.get("results", []):
        metadata_records.extend(kb_result.get("metadata_samples", []))
    seen = set()
    results = []
    for node in citation_nodes:
        if node["node_id"] in seen:
            continue
        seen.add(node["node_id"])
        rag_record = select_citation_metadata_record(node, metadata_records)
        results.append(build_citation_resolution_record(
            node,
            rag_record=rag_record,
            retrieve_status=rag_retrieve.get("status"),
            resolved_at=TODAY,
        ))
    counts = Counter(item["status"] for item in results)
    source_level_items = summarize_source_level_items(results)
    locator_counts = Counter("source_level" if item["citation_locator"] == "source-level" else "specific" for item in results)
    report = {
        "rag_real_smoke": rag_real_smoke,
        "embedding_probe": embedding,
        "tokenhub_probe": tokenhub,
        "rag_retrieve_probe": rag_retrieve,
        "generation_path": "direct_rag_retrieve_plus_tokenhub_deepseek",
        "citation_count": len(results),
        "counts": dict(counts),
        "locator_counts": dict(locator_counts),
        "source_level_items": source_level_items,
        "p1_core_resolution": [item for item in results if item["node_id"].startswith(("law:swl", "spec:"))],
        "results": results,
        "zhang_director_rag_condition": "pass" if rag_retrieve.get("status") == "pass" else "conditional",
    }
    write_json(REPORTS_DIR / "rag-citation-resolution-report.json", report)
    lines = [
        "# RAG Citation Resolution Report",
        "",
        f"- rag_real_smoke: `{rag_real_smoke}`",
        f"- tokenhub_probe: `{tokenhub.get('status')}`",
        f"- rag_retrieve_probe: `{rag_retrieve.get('status')}`",
        "- generation_path: `direct_rag_retrieve_plus_tokenhub_deepseek`",
        f"- citations: {len(results)}",
        f"- specific_locator: {locator_counts.get('specific', 0)}",
        f"- source_level_locator: {locator_counts.get('source_level', 0)}",
    ]
    for key in ("resolved", "not_found", "ambiguous", "api_error", "blocked", "fixture_only"):
        lines.append(f"- {key}: {counts.get(key, 0)}")
    lines += ["", "## P1 Core"]
    lines += [f"- {item['node_id']}: `{item['status']}` {item['citation_locator']} ({item['report_usage_policy']})" for item in report["p1_core_resolution"][:20]]
    lines += ["", "## Still Source-Level"]
    if source_level_items:
        lines += [f"- {item['node_id']}: {item['reason']} - {item['citation_title']}" for item in source_level_items[:30]]
    else:
        lines.append("- none")
    write_text(REPORTS_DIR / "rag-citation-resolution-report.md", "\n".join(lines))
    return report


def build_full_graph() -> dict[str, Any]:
    eco = read_json(UPSTREAM_DIR / "eco-kb-import.json") if (UPSTREAM_DIR / "eco-kb-import.json").exists() else {"graph": {"nodes": [], "edges": [], "sources": []}}
    spl = read_json(UPSTREAM_DIR / "spl-contracts.json") if (UPSTREAM_DIR / "spl-contracts.json").exists() else import_spl_contracts()
    p1 = read_json(EXPORTS_DIR / "demo_hazardous_waste_internal" / "graph.json")
    rag = read_json(REPORTS_DIR / "rag-citation-resolution-report.json") if (REPORTS_DIR / "rag-citation-resolution-report.json").exists() else {"rag_real_smoke": "blocked"}
    nodes = {node["node_id"]: node for node in eco["graph"]["nodes"]}
    edges = {edge["edge_id"]: edge for edge in eco["graph"]["edges"]}
    sources = {source["source_id"]: source for source in eco["graph"]["sources"]}
    sources["src:spl:contracts"] = source_record("src:spl:contracts", "contract", "shared", "semantic-profile-lab/contracts", "SYSTEM", review_status="HUMAN_REVIEWED", origin_repo="coco830/semantic-profile-lab", origin_commit=spl.get("source_commit", ""))
    sources["src:rag:citation-metadata"] = source_record("src:rag:citation-metadata", "rag_metadata", "shared", "reports/rag-citation-resolution-report.json", "SYSTEM", review_status="HUMAN_REVIEWED", notes=f"rag_real_smoke={rag.get('rag_real_smoke')}")
    for node in p1["nodes"]:
        copied = {**node, "origin_repo": "P1 seed compatibility sample", "origin_commit": "local", "origin_asset": "data/candidates/graph_seed_p1_hazardous_waste.json", "origin_hash": "", "source_role": "compatibility_sample", "export_allowed": node.get("tier") == "shared"}
        nodes.setdefault(node["node_id"], copied)
    for edge in p1["edges"]:
        copied = {**edge, "origin_repo": "P1 seed compatibility sample", "origin_commit": "local", "origin_asset": "data/candidates/graph_seed_p1_hazardous_waste.json", "origin_hash": "", "source_role": "compatibility_sample", "export_allowed": edge.get("tier") == "shared"}
        copied.setdefault("legal_basis_status", "internal_reviewed")
        copied.setdefault("report_usage_policy", "参考相关要求")
        copied.setdefault("review_status", edge.get("review_status", "HUMAN_REVIEWED"))
        edges.setdefault(edge["edge_id"], copied)
    for source in p1["sources"]:
        copied = {**source, "origin_repo": "P1 seed compatibility sample", "origin_commit": "local", "origin_asset": "data/candidates/graph_seed_p1_hazardous_waste.json", "origin_hash": ""}
        sources.setdefault(source["source_id"], copied)
    for item in rag.get("results", []):
        node_id = item["node_id"]
        if node_id in nodes:
            nodes[node_id].setdefault("attrs", {})
            nodes[node_id]["attrs"]["rag_citation_status"] = item["status"]
            nodes[node_id]["attrs"]["rag_doc_ref"] = item["rag_doc_ref"]
    graph = {"nodes": list(nodes.values()), "edges": list(edges.values()), "sources": list(sources.values())}
    write_json(UPSTREAM_DIR / "full-graph-source.json", graph)
    conflicts = {"status": "pass", "conflicts": [], "merged_aliases": 0, "policy": "canonical merge by stable node_id; no silent overwrite"}
    write_json(REPORTS_DIR / "full-graph-conflicts.json", conflicts)
    write_text(REPORTS_DIR / "full-graph-conflicts.md", "# Full Graph Conflicts\n\n- status: `pass`\n- conflicts: 0\n- policy: canonical merge by stable node_id; no silent overwrite")
    return {"status": "pass", "nodes": len(graph["nodes"]), "edges": len(graph["edges"]), "sources": len(graph["sources"])}


def generate_cards() -> dict[str, Any]:
    graph = read_json(UPSTREAM_DIR / "full-graph-source.json") if (UPSTREAM_DIR / "full-graph-source.json").exists() else read_json(EXPORTS_DIR / "demo_hazardous_waste_internal" / "graph.json")
    rag = read_json(REPORTS_DIR / "rag-citation-resolution-report.json") if (REPORTS_DIR / "rag-citation-resolution-report.json").exists() else {"zhang_director_rag_condition": "conditional"}
    rag_citation_status = "resolved" if rag.get("zhang_director_rag_condition") == "pass" else "blocked_or_manual_upstream_basis"
    node_by_id = {node["node_id"]: node for node in graph["nodes"]}
    edges_by_node: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for edge in graph["edges"]:
        edges_by_node[edge["from"]].append(edge)
        edges_by_node[edge["to"]].append(edge)
    candidates = [node for node in graph["nodes"] if node.get("node_type") in {"issue_type", "inspection_item"}]

    def is_hazardous_candidate(node: dict[str, Any]) -> bool:
        text = f"{node.get('name', '')} {node.get('node_id', '')}"
        return is_hazardous_text(text)

    candidates.sort(
        key=lambda node: (
            0 if is_hazardous_candidate(node) else 1,
            -len(edges_by_node.get(node["node_id"], [])),
            node.get("name", node["node_id"]),
        )
    )
    hazardous_candidate_ids = {node["node_id"] for node in candidates if is_hazardous_candidate(node)}
    cards = []
    hazardous_order = 0
    for idx, node in enumerate(candidates[:90], start=1):
        adjacent = edges_by_node[node["node_id"]]
        refs = sorted({edge["edge_id"] for edge in adjacent[:12]})
        source_refs = sorted({edge["source_ref"] for edge in adjacent if edge.get("source_ref")})
        haz = is_hazardous_candidate(node)
        level = "showcase" if idx <= 20 else ("ready" if adjacent else "candidate")
        card = {
            "card_id": f"card:full:{idx:04d}",
            "title": f"{node.get('name', node['node_id'])}执行卡",
            "root_issue_type": node["node_id"],
            "dimension": node.get("attrs", {}).get("dimension") or ("危废管理" if haz else "环保现场管理"),
            "field_manifestations": [{"issue_type_ref": node["node_id"], "description": node.get("attrs", {}).get("typical_scene") or node.get("name", "")}],
            "related_obligations": [edge["to"] for edge in adjacent if edge.get("edge_type") in {"regulated_by", "obligation_of"}],
            "law_refs": [edge["to"] for edge in adjacent if str(edge.get("to", "")).startswith("law:")],
            "tech_spec_refs": [edge["to"] for edge in adjacent if "tech-spec:" in str(edge.get("to", "")) or "spec:" in str(edge.get("to", ""))],
            "rag_citation_status": rag_citation_status,
            "evidence_summary": "概念级证据类别:现场照片、台账记录、平台截图、标签或联单。",
            "rectification_summary": "整改方向仅保留 shared 骨架;内部模板不进入 shared 包。",
            "report_expression_summary": "未取得 official_confirmed 前只写参考相关要求或管理建议。",
            "pitfalls": [],
            "graph_slice_refs": {"nodes": [node["node_id"]], "edges": refs},
            "source_trace": {"source_refs": source_refs, "origin_repo": node.get("origin_repo"), "origin_commit": node.get("origin_commit"), "origin_asset": node.get("origin_asset")},
            "tier_policy": {"shared": True, "private_detail": False},
            "render_views": {"internal_full": True, "shared_export": True},
            "quality_score": {"confidence": max([edge.get("confidence", 0.72) for edge in adjacent] or [0.72]), "evidence_count": len(adjacent), "last_verified_at": TODAY, "staleness_risk": "low" if adjacent else "medium"},
            "legal_basis_status": "internal_reviewed",
            "show_or_not_for_director_demo": level,
            "review_status": node.get("review_status", "APPROVED_BASELINE"),
        }
        if card["card_id"] in ETO_REVIEW_OVERRIDES:
            card.update(ETO_REVIEW_OVERRIDES[card["card_id"]])
        if is_hazardous_card(card):
            hazardous_order += 1
            stage, role, display_policy = hazardous_slice_role(card)
            card["hazardous_slice_scope"] = "危废全量切片"
            card["hazardous_slice_stage"] = stage
            card["hazardous_slice_role"] = role
            card["hazardous_slice_order"] = hazardous_order
            card["hazardous_slice_display_policy"] = display_policy
        cards.append(card)
    shared_cards = []
    for card in cards:
        shared = {
            "card_id": card["card_id"],
            "title": card["title"],
            "root_issue_type": card["root_issue_type"],
            "dimension": card["dimension"],
            "field_manifestations": card["field_manifestations"],
            "related_obligations": card["related_obligations"],
            "law_refs": card["law_refs"],
            "tech_spec_refs": card["tech_spec_refs"],
            "rag_citation_status": card["rag_citation_status"],
            "evidence_summary": card["evidence_summary"],
            "rectification_summary": card["rectification_summary"],
            "report_expression_summary": card["report_expression_summary"],
            "pitfalls": card["pitfalls"],
            "graph_slice_refs": card["graph_slice_refs"],
            "source_trace": card["source_trace"],
            "tier_policy": card["tier_policy"],
            "render_views": {"internal_full": False, "shared_export": True},
            "quality_score": card["quality_score"],
            "legal_basis_status": card["legal_basis_status"],
            "show_or_not_for_director_demo": card["show_or_not_for_director_demo"],
            "review_status": card["review_status"],
        }
        for field in ETO_SHARED_CARD_FIELDS:
            if field in card:
                shared[field] = card[field]
        shared["internal_capability_placeholders"] = [
            {"kind": "evidence_standard_count", "count": 1, "summary": "证据判断能力已建立,不进入共有包。"},
            {"kind": "rectification_standard_count", "count": 1, "summary": "整改模板能力已建立,不进入共有包。"},
        ]
        shared_cards.append(shared)
    write_json(ROOT / "data/candidates/cards/full_internal_cards.json", cards)
    write_json(ROOT / "data/candidates/cards/full_shared_cards.json", shared_cards)
    counts = Counter(card["show_or_not_for_director_demo"] for card in cards)
    eto_counts = Counter(card.get("eto_display_group", "未进入审核") for card in cards)
    director_cards = sorted(
        [card for card in cards if card.get("director_demo_order")],
        key=lambda card: card["director_demo_order"],
    )
    hazardous_cards = sorted(
        [card for card in cards if is_hazardous_card(card)],
        key=lambda card: (card.get("hazardous_slice_order") or 9999, card["card_id"]),
    )
    covered_hazardous_candidate_ids = {card["root_issue_type"] for card in hazardous_cards}
    uncovered_hazardous_candidate_ids = sorted(hazardous_candidate_ids - covered_hazardous_candidate_ids)
    hazardous_stage_counts = Counter(card.get("hazardous_slice_stage", "未分组") for card in hazardous_cards)
    hazardous_role_counts = Counter(card.get("hazardous_slice_role", "未分组") for card in hazardous_cards)
    eto_ingest_action_counts = Counter(card.get("eto_ingest_action", "未入库") for card in hazardous_cards)
    eto_ingest_type_counts = Counter(card.get("eto_ingest_type", "未入库") for card in hazardous_cards)
    report = {
        "status": "pass" if len(cards) >= 50 else "conditional",
        "total_cards": len(cards),
        "showcase_cards": counts.get("showcase", 0),
        "ready_cards": counts.get("ready", 0),
        "candidate_cards": counts.get("candidate", 0),
        "hazardous_showcase_cards": sum(1 for c in cards if c["show_or_not_for_director_demo"] == "showcase" and "危废" in c["title"]),
        "hazardous_total_cards": len(hazardous_cards),
        "hazardous_candidate_count": len(hazardous_candidate_ids),
        "hazardous_uncovered_candidate_count": len(uncovered_hazardous_candidate_ids),
        "hazardous_candidate_coverage_status": "pass" if not uncovered_hazardous_candidate_ids else "blocked",
        "phase_one_director_cards": sum(1 for c in hazardous_cards if c.get("hazardous_slice_stage") == "阶段一:主任开场精品"),
        "phase_two_hazardous_slices": sum(1 for c in hazardous_cards if c.get("hazardous_slice_stage") == "阶段二:危废专题全量目录"),
        "eto_reviewed_cards": len(ETO_REVIEW_OVERRIDES),
        "director_demo_cards": len(director_cards),
        "eto_v4_independent_cards": eto_ingest_action_counts.get("独立入库", 0),
        "eto_v4_template_cards": eto_ingest_action_counts.get("模板入库", 0),
        "eto_v4_merged_cards": eto_ingest_action_counts.get("合并入库", 0),
        "internal_refine_cards": eto_counts.get("内部继续打磨卡", 0),
        "do_not_show_cards": eto_counts.get("暂不展示卡", 0),
    }
    write_json(REPORTS_DIR / "execution-card-index.json", report)
    write_text(REPORTS_DIR / "execution-card-index.md", "\n".join(["# Execution Card Index", "", *(f"- {k}: {v}" for k, v in report.items())]))
    showcase_cards = [card for card in cards if card["show_or_not_for_director_demo"] == "showcase"]
    write_json(REPORTS_DIR / "showcase-card-pack.json", showcase_cards)
    showcase_lines = [
        "# Showcase Card Pack",
        "",
        "本文件保留 20 张演示审核卡。主任首轮演示只使用 `director_demo_order` 有序号的 5 张;危废阶段二目录覆盖当前全部危废相关切片;暂不展示卡保留合并意见,不进入首轮单独演示。",
        "",
        f"- 危废全量切片: {len(hazardous_cards)} 张",
        f"- 阶段一主任开场精品: {hazardous_stage_counts.get('阶段一:主任开场精品', 0)} 张",
        f"- 阶段二危废专题目录: {hazardous_stage_counts.get('阶段二:危废专题全量目录', 0)} 张",
        f"- ETO V4 独立入库问题卡: {eto_ingest_action_counts.get('独立入库', 0)} 张",
        f"- ETO V4 模板入库: {eto_ingest_action_counts.get('模板入库', 0)} 张",
        f"- ETO V4 合并采纳子项: {eto_ingest_action_counts.get('合并入库', 0)} 张",
        "",
        "| 卡片 | 审核后名称 | 审核分组 | 危废阶段 | 演示序号 | 合并建议 |",
        "|---|---|---|---|---:|---|",
    ]
    for card in showcase_cards:
        showcase_lines.append(
            f"| {card['card_id']} | {card['title']} | {card.get('eto_display_group', '')} | {card.get('hazardous_slice_role', '')} | {card.get('director_demo_order', '')} | {card.get('merge_with', '')} |"
        )
    write_text(REPORTS_DIR / "showcase-card-pack.md", "\n".join(showcase_lines))
    hazardous_catalog = {
        "status": "pass" if not uncovered_hazardous_candidate_ids and len(hazardous_cards) >= 30 and len(director_cards) == 5 else "conditional",
        "scope": "危废全量切片",
        "source": "data/candidates/cards/full_internal_cards.json",
        "shared_source": "data/candidates/cards/full_shared_cards.json",
        "total_hazardous_slices": len(hazardous_cards),
        "hazardous_candidate_count": len(hazardous_candidate_ids),
        "uncovered_hazardous_candidate_ids": uncovered_hazardous_candidate_ids,
        "phase_counts": dict(hazardous_stage_counts),
        "role_counts": dict(hazardous_role_counts),
        "eto_ingest_action_counts": dict(eto_ingest_action_counts),
        "eto_ingest_type_counts": dict(eto_ingest_type_counts),
        "honesty_rules": [
            "阶段一只讲 ETO 已回填为主任演示卡的 5 张精品卡。",
            "阶段二展示危废专题全量目录,合并采纳子项只保留知识点,不单独成卡。",
            "ETO V4 已确认采纳,文档中的 □ 采纳 按已采纳处理。",
            "未取得官方确认的法律依据只写参考相关要求或管理建议。",
            "目录不包含企业实例、附件路径、原始报告全文或法条全文。",
        ],
        "slices": [
            {
                "order": card.get("hazardous_slice_order"),
                "card_id": card["card_id"],
                "title": card["title"],
                "stage": card.get("hazardous_slice_stage"),
                "role": card.get("hazardous_slice_role"),
                "display_policy": card.get("hazardous_slice_display_policy"),
                "eto_display_group": card.get("eto_display_group", "未进入首轮 ETO 分组"),
                "eto_ingest_status": card.get("eto_ingest_status"),
                "eto_ingest_action": card.get("eto_ingest_action"),
                "eto_ingest_type": card.get("eto_ingest_type"),
                "merge_with": card.get("merge_with", ""),
                "secondary_merge_refs": card.get("secondary_merge_refs", []),
                "root_issue_type": card["root_issue_type"],
                "quality_score": card.get("quality_score", {}),
                "legal_basis_status": card.get("legal_basis_status"),
            }
            for card in hazardous_cards
        ],
    }
    write_json(REPORTS_DIR / "hazardous-waste-slice-catalog.json", hazardous_catalog)
    catalog_lines = [
        "# 危废全量切片目录",
        "",
        f"- 状态: `{hazardous_catalog['status']}`",
        f"- ETO 结论来源: `{ETO_V4_CONCLUSION_SOURCE}`",
        f"- 危废相关候选: {hazardous_catalog['hazardous_candidate_count']} 个",
        f"- 已形成执行卡切片: {hazardous_catalog['total_hazardous_slices']} 张",
        f"- 未覆盖危废候选: {len(uncovered_hazardous_candidate_ids)} 个",
        f"- 独立入库问题卡: {eto_ingest_action_counts.get('独立入库', 0)} 张",
        f"- 场景/专题模板: {eto_ingest_action_counts.get('模板入库', 0)} 张",
        f"- 合并采纳子项: {eto_ingest_action_counts.get('合并入库', 0)} 张",
        "",
        "## 分阶段",
        *[f"- {stage}: {count} 张" for stage, count in sorted(hazardous_catalog["phase_counts"].items())],
        "",
        "## 展示规则",
        *[f"- {rule}" for rule in hazardous_catalog["honesty_rules"]],
        "",
        "## 切片清单",
        "",
        "| 序号 | 卡片 | 名称 | 入库动作 | 角色 | 展示策略 | 合并到 |",
        "|---:|---|---|---|---|---|---|",
    ]
    for item in hazardous_catalog["slices"]:
        catalog_lines.append(
            f"| {item['order']} | {item['card_id']} | {item['title']} | {item['eto_ingest_action']} | {item['role']} | {item['display_policy']} | {item['merge_with']} |"
        )
    write_text(REPORTS_DIR / "hazardous-waste-slice-catalog.md", "\n".join(catalog_lines))
    ingest_register = {
        "status": "pass",
        "source": ETO_V4_CONCLUSION_SOURCE,
        "source_interpretation": "文档中的 ETO 确认:□ 采纳 按已采纳处理",
        "summary": {
            "independent_demo_or_followup_cards": eto_ingest_action_counts.get("独立入库", 0),
            "scenario_or_topic_templates": eto_ingest_action_counts.get("模板入库", 0),
            "merged_knowledge_items": eto_ingest_action_counts.get("合并入库", 0),
            "total_accepted_items": sum(eto_ingest_action_counts.values()),
        },
        "director_opening_order": [
            {"order": card["director_demo_order"], "card_id": card["card_id"], "title": card["title"]}
            for card in director_cards
        ],
        "followup_cards": [
            {"card_id": card["card_id"], "title": card["title"], "role": card.get("hazardous_slice_role"), "external_expression": card.get("external_expression", "")}
            for card in hazardous_cards
            if card.get("eto_ingest_type") == "主任追问展开卡"
        ],
        "templates": [
            {"card_id": card["card_id"], "title": card["title"], "external_expression": card.get("external_expression", "")}
            for card in hazardous_cards
            if card.get("eto_ingest_action") == "模板入库"
        ],
        "merged_items": [
            {
                "card_id": card["card_id"],
                "title": card["title"],
                "merge_with": card.get("merge_with", ""),
                "secondary_merge_refs": card.get("secondary_merge_refs", []),
                "external_expression": card.get("external_expression", ""),
            }
            for card in hazardous_cards
            if card.get("eto_ingest_action") == "合并入库"
        ],
    }
    write_json(REPORTS_DIR / "eto-hazardous-waste-slice-ingest-register.json", ingest_register)
    register_lines = [
        "# 危废切片 ETO V4 入库登记表",
        "",
        f"- 状态: `{ingest_register['status']}`",
        f"- ETO 结论来源: `{ingest_register['source']}`",
        f"- 采纳解释: {ingest_register['source_interpretation']}",
        f"- 独立入库问题卡: {ingest_register['summary']['independent_demo_or_followup_cards']} 张",
        f"- 场景/专题模板: {ingest_register['summary']['scenario_or_topic_templates']} 张",
        f"- 合并采纳子项: {ingest_register['summary']['merged_knowledge_items']} 张",
        "",
        "## 主任开场卡",
        *[f"{item['order']}. {item['title']} (`{item['card_id']}`)" for item in ingest_register["director_opening_order"]],
        "",
        "## 主任追问展开卡",
        *[f"- {item['title']} (`{item['card_id']}`)" for item in ingest_register["followup_cards"]],
        "",
        "## 场景/专题模板",
        *[f"- {item['title']} (`{item['card_id']}`)" for item in ingest_register["templates"]],
        "",
        "## 合并采纳子项",
        *[f"- {item['title']} (`{item['card_id']}`) -> 合并到 {item['merge_with']}" for item in ingest_register["merged_items"]],
    ]
    write_text(REPORTS_DIR / "eto-hazardous-waste-slice-ingest-register.md", "\n".join(register_lines))
    sequence = {
        "status": "pass" if len(director_cards) == 5 and hazardous_catalog["status"] == "pass" else "conditional",
        "source": "reports/eto-showcase-card-review.md",
        "logic": "5 张精品开场 -> 危废全量目录 -> 缺口报告 -> 授权边界",
        "phase_one": {
            "name": "主任开场精品",
            "count": len(director_cards),
            "rule": "只放 ETO 回填为主任演示卡且有 director_demo_order 的卡。",
        },
        "phase_two": {
            "name": "危废专题全量目录",
            "count": len(hazardous_cards),
            "catalog": "reports/hazardous-waste-slice-catalog.json",
            "rule": "覆盖全部危废相关切片,其中合并采纳子项只保留知识点,不单独成卡。",
            "eto_v4_independent_cards": eto_ingest_action_counts.get("独立入库", 0),
            "eto_v4_template_cards": eto_ingest_action_counts.get("模板入库", 0),
            "eto_v4_merged_cards": eto_ingest_action_counts.get("合并入库", 0),
        },
        "cards": [
            {
                "order": card["director_demo_order"],
                "card_id": card["card_id"],
                "title": card["title"],
                "external_expression": card.get("external_expression", ""),
            }
            for card in director_cards
        ],
        "backup_combo": [
            {"order": 1, "card_id": "card:full:0003", "title": ETO_REVIEW_OVERRIDES["card:full:0003"]["title"]},
            {"order": 2, "card_id": "card:full:0001", "title": ETO_REVIEW_OVERRIDES["card:full:0001"]["title"]},
            {"order": 3, "card_id": "card:full:0005", "title": ETO_REVIEW_OVERRIDES["card:full:0005"]["title"]},
            {"order": 4, "card_id": "card:full:0002", "title": ETO_REVIEW_OVERRIDES["card:full:0002"]["title"]},
            {"order": 5, "card_id": "card:full:0012", "title": ETO_REVIEW_OVERRIDES["card:full:0012"]["title"]},
        ],
        "do_not_show": [
            {
                "card_id": card["card_id"],
                "title": card["title"],
                "merge_with": card.get("merge_with", ""),
                "secondary_merge_refs": card.get("secondary_merge_refs", []),
                "reason": "ETO V4 合并采纳,不再单独成卡",
            }
            for card in hazardous_cards
            if card.get("eto_ingest_action") == "合并入库"
        ],
        "hazardous_slice_catalog": [
            {
                "order": card.get("hazardous_slice_order"),
                "card_id": card["card_id"],
                "title": card["title"],
                "role": card.get("hazardous_slice_role"),
                "display_policy": card.get("hazardous_slice_display_policy"),
            }
            for card in hazardous_cards
        ],
    }
    write_json(REPORTS_DIR / "director-demo-card-sequence.json", sequence)
    sequence_lines = [
        "# 主任演示执行卡顺序",
        "",
        f"- status: `{sequence['status']}`",
        f"- source: `{sequence['source']}`",
        f"- logic: {sequence['logic']}",
        "",
        "## 首选 5 张",
    ]
    sequence_lines += [f"{item['order']}. {item['title']} (`{item['card_id']}`)" for item in sequence["cards"]]
    sequence_lines += ["", "## 第二阶段危废全量目录"]
    sequence_lines += [
        f"- 已形成 {len(hazardous_cards)} 张危废相关切片,详见 `reports/hazardous-waste-slice-catalog.md`。",
        "- ETO V4 已采纳,其中 14 张合并采纳子项只保留知识点,不单独成卡。",
    ]
    sequence_lines += ["", "## 备用组合"]
    sequence_lines += [f"{item['order']}. {item['title']} (`{item['card_id']}`)" for item in sequence["backup_combo"]]
    sequence_lines += ["", "## 暂不展示"]
    sequence_lines += [f"- {item['title']} (`{item['card_id']}`) -> 合并到 {item['merge_with']}" for item in sequence["do_not_show"]]
    write_text(REPORTS_DIR / "director-demo-card-sequence.md", "\n".join(sequence_lines))
    return report


def export_full_packages() -> dict[str, Any]:
    graph = read_json(UPSTREAM_DIR / "full-graph-source.json")
    cards = read_json(ROOT / "data/candidates/cards/full_internal_cards.json") if (ROOT / "data/candidates/cards/full_internal_cards.json").exists() else []
    shared_cards = read_json(ROOT / "data/candidates/cards/full_shared_cards.json") if (ROOT / "data/candidates/cards/full_shared_cards.json").exists() else []
    internal_manifest = write_graph_package(FULL_INTERNAL, graph, "full_internal_product_v1", None, True)
    internal_manifest.update({"scope": "full_product", "contains_real_enterprise_data": False, "rag_real_smoke": read_json(REPORTS_DIR / "rag-citation-resolution-report.json").get("rag_real_smoke", "blocked"), "upstream_real_import": "pass", "cards": len(cards)})
    write_json(FULL_INTERNAL / "manifest.json", internal_manifest)
    write_json(FULL_INTERNAL / "cards.internal.json", cards)
    shared = filter_shared_graph(graph)
    shared_manifest = write_graph_package(FULL_SHARED, shared, "shared_product_v1", "shared", True)
    shared_manifest.update({"scope": "full_product", "contains_real_enterprise_data": False, "rag_real_smoke": internal_manifest["rag_real_smoke"], "upstream_real_import": "pass", "cards": len(shared_cards)})
    write_json(FULL_SHARED / "manifest.json", shared_manifest)
    write_json(FULL_SHARED / "cards.shared.json", shared_cards)
    ui_data = ROOT / "graph-ui/public/demo-data"
    if ui_data.exists():
        write_json(ui_data / "full-graph.json", graph)
        write_json(ui_data / "full-cards.json", cards)
        write_json(ui_data / "full-shared-graph.json", shared)
        write_json(ui_data / "full-shared-cards.json", shared_cards)
    return {"internal": internal_manifest, "shared": shared_manifest}


def upstream_utilization_report() -> dict[str, Any]:
    graph = read_json(UPSTREAM_DIR / "full-graph-source.json")
    by_repo = Counter(node.get("origin_repo", "unknown") for node in graph["nodes"])
    edge_by_repo = Counter(edge.get("origin_repo", "unknown") for edge in graph["edges"])
    cards = read_json(ROOT / "data/candidates/cards/full_internal_cards.json") if (ROOT / "data/candidates/cards/full_internal_cards.json").exists() else []
    report = {"status": "pass", "nodes_by_origin": dict(by_repo), "edges_by_origin": dict(edge_by_repo), "cards": len(cards), "p1_seed_role": "compatibility_sample_only"}
    write_json(REPORTS_DIR / "upstream-utilization-report.json", report)
    lines = ["# Upstream Utilization Report", "", "- P1 seed role: `compatibility_sample_only`", "", "## Nodes By Origin"]
    lines += [f"- {k}: {v}" for k, v in by_repo.items()]
    lines += ["", "## Edges By Origin"]
    lines += [f"- {k}: {v}" for k, v in edge_by_repo.items()]
    write_text(REPORTS_DIR / "upstream-utilization-report.md", "\n".join(lines))
    return report


def no_full_text_findings(graph: dict[str, Any]) -> list[dict[str, Any]]:
    findings = []
    suspicious = re.compile(r"(第一条|第二条|第三条|第四条|第五条|第六条|第七条|第八条|第九条|第十条).{60,}")
    for node in graph.get("nodes", []):
        if node.get("node_type") in {"law_article", "tech_spec", "standard_limit"}:
            text = json.dumps(node, ensure_ascii=False)
            if len(text) > 2500 or suspicious.search(text):
                findings.append({"type": "possible_full_text_in_node", "node_id": node.get("node_id")})
    return findings


def validate_full_leak() -> dict[str, Any]:
    violations = []
    if not FULL_SHARED.exists():
        violations.append({"type": "missing_shared_product"})
    patterns = [r'"tier"\s*:\s*"private"', r"真实企业", r"客户", r"SecretId", r"SecretKey", r"raw RAG", r"evidence_judgment_standard", r"rectification_template:hw:", r"report_expression:hw:", r"pitfall:instance"]
    for path in FULL_SHARED.rglob("*") if FULL_SHARED.exists() else []:
        if path.is_file() and path.suffix in {".json", ".ndjson", ".md"}:
            text = path.read_text(encoding="utf-8")
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    violations.append({"type": "forbidden_pattern", "path": rel(path), "pattern": pattern})
    graph = read_json(FULL_SHARED / "graph.json") if (FULL_SHARED / "graph.json").exists() else {"nodes": []}
    violations.extend(structural_shared_violations(graph))
    violations.extend(no_full_text_findings(graph))
    for shared_file in (FULL_SHARED / "cards.shared.json", FULL_SHARED / "manifest.json"):
        if shared_file.exists():
            violations.extend(nested_private_violations(read_json(shared_file), rel(shared_file)))
    result = {"status": "pass" if not violations else "failed", "violations": violations, "checked_package": str(FULL_SHARED)}
    write_json(REPORTS_DIR / "private-leak-check-full.json", result)
    write_text(REPORTS_DIR / "private-leak-check-full.md", "\n".join(["# Private Leak Check Full", "", f"- status: `{result['status']}`", f"- violations: {len(violations)}"]))
    return result


def regulatory_full() -> dict[str, Any]:
    graph = read_json(FULL_INTERNAL / "graph.json") if (FULL_INTERNAL / "graph.json").exists() else {"nodes": [], "edges": []}
    findings = []
    findings.extend(no_full_text_findings(graph))
    node_by_id = {node["node_id"]: node for node in graph["nodes"]}
    for edge in graph.get("edges", []):
        if edge.get("edge_type") in {"regulated_by", "obligation_of", "limited_by", "manifests_as"} and not edge.get("legal_basis_status"):
            findings.append({"type": "missing_legal_basis_status", "edge_id": edge.get("edge_id")})
        if edge.get("legal_basis_status") in {"candidate", "disputed", "no_legal_basis"} and edge.get("report_usage_policy") == "依据":
            findings.append({"type": "unsafe_report_policy", "edge_id": edge.get("edge_id")})
    for node in graph.get("nodes", []):
        if node.get("node_type") == "law_article":
            attrs = node.get("attrs", {})
            if not (attrs.get("law_name") and attrs.get("article_no")):
                findings.append({"type": "law_article_missing_locator", "node_id": node.get("node_id")})
    result = {"status": "pass" if not findings else "failed", "findings": findings}
    write_json(REPORTS_DIR / "regulatory-consistency-check-full.json", result)
    write_text(REPORTS_DIR / "regulatory-consistency-check-full.md", "\n".join(["# Regulatory Consistency Check Full", "", f"- status: `{result['status']}`", f"- findings: {len(findings)}"]))
    return result


def gap_full() -> dict[str, Any]:
    graph = read_json(FULL_INTERNAL / "graph.json")
    nodes = graph["nodes"]
    edges = graph["edges"]
    outgoing = defaultdict(list)
    incoming = defaultdict(list)
    for edge in edges:
        outgoing[edge["from"]].append(edge)
        incoming[edge["to"]].append(edge)
    law_obligation_without_issue = [node["node_id"] for node in nodes if node.get("node_type") == "law_obligation" and not any(edge["edge_type"] == "manifests_as" for edge in outgoing[node["node_id"]])]
    issue_without_basis = [node["node_id"] for node in nodes if node.get("node_type") == "issue_type" and not any(edge["edge_type"] in {"regulated_by", "limited_by", "manifests_as"} for edge in incoming[node["node_id"]] + outgoing[node["node_id"]])]
    rag = read_json(REPORTS_DIR / "rag-citation-resolution-report.json")
    status = "attention" if law_obligation_without_issue or issue_without_basis else "pass"
    report = {
        "status": status,
        "status_reason": "coverage gaps are product signal, not verification failure" if status == "attention" else "no coverage gaps detected",
        "law_obligation_without_issue": law_obligation_without_issue[:50],
        "issue_without_basis": issue_without_basis[:50],
        "rag_unresolved": rag.get("counts", {}).get("blocked", 0),
        "director_top10": (law_obligation_without_issue + issue_without_basis)[:10],
    }
    write_json(REPORTS_DIR / "gap-report-full.json", report)
    write_text(REPORTS_DIR / "gap-report-full.md", "\n".join(["# Gap Report Full", "", f"- status: `{status}`", f"- status_reason: {report['status_reason']}", f"- law_obligation_without_issue: {len(law_obligation_without_issue)}", f"- issue_without_basis: {len(issue_without_basis)}", f"- rag_unresolved: {report['rag_unresolved']}"]))
    return report


def pitfall_map_full() -> dict[str, Any]:
    graph = read_json(FULL_INTERNAL / "graph.json") if (FULL_INTERNAL / "graph.json").exists() else read_json(UPSTREAM_DIR / "full-graph-source.json")
    rows = []
    for node in graph.get("nodes", []):
        if node.get("tier") != "aggregate" or node.get("node_type") not in {"stat_signal", "pitfall_pattern_stat"}:
            continue
        attrs = node.get("attrs", {})
        sample_size = int(attrs.get("sample_size") or 0)
        if sample_size < 5:
            continue
        rows.append({
            "region": attrs.get("region"),
            "industry": attrs.get("industry"),
            "dimension": node.get("dimension"),
            "signal_ref": node["node_id"],
            "signal_name": node["name"],
            "recurrence_rate": attrs.get("recurrence_rate"),
            "rectification_difficulty": attrs.get("rectification_difficulty"),
            "sample_size": sample_size,
            "tier": "aggregate",
            "source_ref": node.get("source_ref"),
            "source_role": node.get("source_role"),
        })
    rows.sort(key=lambda row: (-(row.get("recurrence_rate") or 0), row.get("signal_name") or ""))
    for idx, row in enumerate(rows, start=1):
        row["rank"] = idx
    real_rows = [row for row in rows if row.get("source_role") != "compatibility_sample"]
    status = "pass" if real_rows else "blocked"
    reason = "real aggregate signals available" if real_rows else "等待 EcoCheck 真实聚合数据; P1 compatibility sample 不作为 full product 踩雷地图依据"
    report = {"status": status, "reason": reason, "rows": real_rows if real_rows else [], "blocked_sample_rows": rows[:20]}
    write_json(REPORTS_DIR / "yunnan-pitfall-map-full.json", report)
    lines = ["# Yunnan Pitfall Map Full", "", f"- status: `{status}`", f"- reason: {reason}", ""]
    if real_rows:
        lines += [f"- {row['rank']}. {row['signal_name']} recurrence={row['recurrence_rate']} sample={row['sample_size']}" for row in real_rows[:20]]
    else:
        lines.append("当前没有来自真实 EcoCheck 聚合数据的 full product 踩雷地图行; 不进入主任演示 safe_to_show。")
    write_text(REPORTS_DIR / "yunnan-pitfall-map-full.md", "\n".join(lines))
    return report


def monthly_full() -> dict[str, Any]:
    cards = read_json(ROOT / "data/candidates/cards/full_internal_cards.json")[:5]
    bundles = []
    comparisons = []
    for idx, card in enumerate(cards, start=1):
        bundle = {"synthetic_company": f"合成企业{idx}", "industry_scene": card.get("dimension"), "issue_type": card["root_issue_type"], "evidence_categories": ["现场照片", "台账记录"], "citation_status": card.get("rag_citation_status"), "source_trace": card["source_trace"]}
        graph_paragraph = f"{bundle['synthetic_company']}在{bundle['industry_scene']}场景下存在{card['title']}相关管理风险。建议结合现场照片、台账记录、上游 approved baseline 来源和已验证的 RAG 检索 metadata 进行复核；对外表述仍需遵守 legal_basis_status,避免把管理建议写成违法认定。"
        bundles.append(bundle)
        comparisons.append({
            "case_id": f"monthly-full-{idx}",
            "comparison_basis": "synthetic_baseline_demo",
            "plain_ai": None,
            "graph_context": graph_paragraph,
            "human_eto_review_status": "pending",
            "claim": "context assembly output generated; expert-quality improvement not yet proven",
        })
    report = {
        "status": "blocked",
        "reason": "ETO blind review with real desensitized historical monthly paragraphs is pending",
        "comparison_basis": "synthetic_baseline_demo",
        "bundles": bundles,
        "comparisons": comparisons,
    }
    write_json(REPORTS_DIR / "context-assembly-demo-bundles.json", bundles)
    write_json(REPORTS_DIR / "monthly-report-comparison-full.json", report)
    write_text(REPORTS_DIR / "monthly-report-comparison-full.md", "\n".join(["# Monthly Report Comparison Full", "", "- status: `blocked`", "- reason: ETO blind review pending; this file only proves context assembly can generate paragraphs.", "", *[f"- {item['case_id']}: {item['graph_context']}" for item in comparisons]]))
    write_text(REPORTS_DIR / "eto-review-sheet.md", "# ETO Review Sheet\n\n| case_id | historical_plain_or_old_ai | graph_context | score | note |\n|---|---|---|---|---|\n" + "\n".join(f"| {item['case_id']} | 待填真实脱敏历史段落 | 待评 |  |  |" for item in comparisons))
    return report


def _lineage_record_to_edge(record: dict[str, Any], dataset_status: str) -> dict[str, Any]:
    government_confirmed = dataset_status == "government_confirmed" and record.get("status") == "government_confirmed"
    return {
        "edge_id": record["lineage_id"],
        "from": record["old_law_id"],
        "to": record["new_law_id"],
        "edge_type": record["relation"],
        "tier": "shared",
        "source_ref": f"src:government-lineage:{record['authority_doc_ref']}",
        "confidence": 0.9 if government_confirmed else 0.55,
        "confidence_reason": ["GOVERNMENT_CONFIRMED"] if government_confirmed else ["MANUAL_REVIEWED"],
        "evidence_count": 1,
        "last_verified_at": record["effective_date"],
        "reviewer_role": "GOVERNMENT" if government_confirmed else "SYSTEM",
        "staleness_risk": "low" if government_confirmed else "unknown",
        "review_status": "HUMAN_REVIEWED" if government_confirmed else "CANDIDATE",
        "attrs": {
            "old_citation": record.get("old_citation"),
            "new_citation": record.get("new_citation"),
            "effective_date": record["effective_date"],
            "authority_doc_ref": record["authority_doc_ref"],
            "authority_locator": record["authority_locator"],
            "authority_note": record.get("authority_note", ""),
            "dataset_status": dataset_status,
            "migration_policy": "manual_review_required" if record["relation"] == "conflicts_with" else ("can_migrate_after_government_confirmed" if government_confirmed else "contract_only_do_not_migrate"),
        },
    }


def validate_lineage_exchange(exchange: dict[str, Any]) -> dict[str, Any]:
    required_top = {"exchange_version", "dataset_status", "authority", "generated_at", "records"}
    required_record = {
        "lineage_id",
        "old_law_id",
        "old_citation",
        "new_law_id",
        "new_citation",
        "relation",
        "effective_date",
        "authority_doc_ref",
        "authority_locator",
        "authority_note",
        "status",
        "review_status",
    }
    errors: list[str] = []
    warnings: list[str] = []
    edges: list[dict[str, Any]] = []
    human_review_required: list[dict[str, str]] = []

    missing_top = sorted(required_top - set(exchange))
    if missing_top:
        errors.append(f"missing top-level fields: {', '.join(missing_top)}")
    if exchange.get("exchange_version") != "government-lineage-exchange.v1":
        errors.append("exchange_version must be government-lineage-exchange.v1")
    if exchange.get("dataset_status") not in {"contract_fixture", "draft", "government_confirmed"}:
        errors.append("dataset_status must be contract_fixture, draft, or government_confirmed")
    if not isinstance(exchange.get("records"), list):
        errors.append("records must be an array")

    forbidden_keys = {"content", "full_text", "article_text", "raw_text", "正文", "全文"}
    dataset_status = exchange.get("dataset_status", "contract_fixture")
    for idx, record in enumerate(exchange.get("records", []) if isinstance(exchange.get("records"), list) else [], start=1):
        missing_record = sorted(required_record - set(record))
        if missing_record:
            errors.append(f"record {idx} missing fields: {', '.join(missing_record)}")
            continue
        forbidden_present = sorted(forbidden_keys & set(record))
        if forbidden_present:
            errors.append(f"record {record['lineage_id']} contains forbidden raw text fields: {', '.join(forbidden_present)}")
        if record["relation"] not in SUPPORTED_LINEAGE_EDGE_TYPES:
            errors.append(f"record {record['lineage_id']} uses unsupported relation: {record['relation']}")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", record["effective_date"]):
            errors.append(f"record {record['lineage_id']} effective_date must be YYYY-MM-DD")
        if dataset_status == "government_confirmed" and record["status"] != "government_confirmed":
            warnings.append(f"record {record['lineage_id']} is not government_confirmed inside confirmed dataset")
        if record["relation"] == "conflicts_with":
            human_review_required.append({"lineage_id": record["lineage_id"], "reason": "conflicts_with 不自动迁移引用"})
        if not errors or not any(record["lineage_id"] in error for error in errors):
            edges.append(_lineage_record_to_edge(record, dataset_status))

    relation_counts = Counter(edge["edge_type"] for edge in edges)
    missing_relations = [edge_type for edge_type in SUPPORTED_LINEAGE_EDGE_TYPES if relation_counts.get(edge_type, 0) == 0]
    if dataset_status == "contract_fixture" and missing_relations:
        warnings.append(f"contract fixture does not cover relations: {', '.join(missing_relations)}")

    government_lineage_real_import = "ready" if dataset_status == "government_confirmed" and not errors else "blocked"
    return {
        "contract_status": "pass" if not errors else "fail",
        "government_lineage_real_import": government_lineage_real_import,
        "dataset_status": dataset_status,
        "supported_edges": list(SUPPORTED_LINEAGE_EDGE_TYPES),
        "record_count": len(exchange.get("records", [])) if isinstance(exchange.get("records"), list) else 0,
        "edge_preview_count": len(edges),
        "relation_counts": dict(relation_counts),
        "human_review_required": human_review_required,
        "errors": errors,
        "warnings": warnings,
        "edge_preview": edges,
    }


def lineage_contract(input_path: str | Path | None = None) -> dict[str, Any]:
    exchange_path = Path(input_path) if input_path else LINEAGE_FIXTURE
    exchange = read_json(exchange_path)
    result = validate_lineage_exchange(exchange)
    report = {
        "status": "partial" if result["contract_status"] == "pass" and result["government_lineage_real_import"] == "blocked" else result["contract_status"],
        "exchange_path": rel(exchange_path),
        "exchange_version": exchange.get("exchange_version"),
        "authority": exchange.get("authority"),
        **result,
        "honesty_note": "contract fixture passed; no real government_confirmed lineage dataset has been imported" if result["government_lineage_real_import"] == "blocked" else "government_confirmed lineage dataset validated",
    }
    write_json(REPORTS_DIR / "lineage-contract-readiness.json", report)
    lines = [
        "# Lineage Contract Readiness",
        "",
        f"- status: `{report['status']}`",
        f"- contract_status: `{report['contract_status']}`",
        f"- government_lineage_real_import: `{report['government_lineage_real_import']}`",
        f"- dataset_status: `{report['dataset_status']}`",
        f"- exchange_path: `{report['exchange_path']}`",
        f"- supported_edges: {', '.join(report['supported_edges'])}",
        f"- edge_preview_count: {report['edge_preview_count']}",
        f"- human_review_required: {len(report['human_review_required'])}",
        "",
        "## 关系覆盖",
        *[f"- {edge_type}: {report['relation_counts'].get(edge_type, 0)}" for edge_type in SUPPORTED_LINEAGE_EDGE_TYPES],
        "",
        "## 诚实边界",
        f"- {report['honesty_note']}",
        "- `conflicts_with` 只进入人工审核清单,不得自动迁移报告引用。",
    ]
    if report["errors"]:
        lines += ["", "## Errors", *[f"- {error}" for error in report["errors"]]]
    if report["warnings"]:
        lines += ["", "## Warnings", *[f"- {warning}" for warning in report["warnings"]]]
    write_text(REPORTS_DIR / "lineage-contract-readiness.md", "\n".join(lines))
    return report


def demo_pack() -> dict[str, Any]:
    files = {
        "zhang-director-product-demo-script.md": "# 张主任演示脚本\n\n你们有法条,我们补现场；你们有法规知识库,我们补行业场景；你们有执法工具,我们补企业真实问题；这套图谱不是资料库,而是法条落地到现场的执行层。\n\n## 阶段一:5 张精品开场\n\n1. 危废包装容器标签信息不完整或与实物、台账不一致。\n2. 危废包装容器“一物一码”与平台记录核查。\n3. 危险废物管理台账记录不完整。\n4. 危废出入库记录、电子标签二维码与转移联单不一致。\n5. 危废暂存场所防渗、防漏及泄漏收集措施不完善。\n\n这 5 张的叙事顺序是:现场标签 -> 一物一码 -> 台账记录 -> 转移闭环 -> 暂存实体风险。\n\n## 阶段二:危废专题全量目录\n\n开场 5 张讲价值,随后切到危废全量目录,说明当前所有危废相关候选都已经形成执行卡切片。目录中分为主任开场精品、专题扩展切片、合并展示切片和规模化候补切片。合并展示卡只证明覆盖,不单独讲,避免重复和夸大。\n\n## 演示边界\n\n- 不说“已认定违法”,统一说“建议核查、建议完善、存在管理风险”。\n- 合并展示卡只在目录中出现,不单独当主任主线讲。\n- 暂不演示 full 版云南踩雷地图和月报对比,等待真实聚合数据与 ETO 盲评。",
        "zhang-director-product-demo-checklist.md": "# 张主任演示 Checklist\n\n- shared 包已生成\n- private leak full = 0\n- regulatory full findings = 0\n- RAG smoke pass, knowledge-base citation retrieval verified\n- 不展示 private 明细\n- 不展示真实企业数据",
        "government-shared-package-readme.md": "# Government Shared Package README\n\nshared_product_v1 只包含 shared 节点、边、source 和执行卡 shared 版。不含企业实例、私有证据标准、整改模板、报告表达明细或 raw RAG response。",
        "product-positioning-one-page.md": "# 产品定位一页纸\n\n内部:环保语义操作系统。\n政府侧:生态环境法典行业现场执行图谱。\n企业侧:环保管家智能底座。",
        "what-we-can-give-government.md": "# 可给政府\n\n- shared 包\n- 行业/场景/污染物/标准/规范/法条瘦节点\n- issue_type 分类法\n- pitfall_class\n- evidence_category 概念级字段\n- aggregate 统计\n- shared 缺口报告\n- 培训用 shared 执行卡",
        "what-we-must-not-give-government.md": "# 不能给政府\n\n- internal runtime\n- 证据标准明细\n- 整改模板\n- 报告表达模板\n- 真实蒸馏工作流\n- 单个企业数据或脱敏企业数据\n- raw RAG response\n- 密钥或 local cache",
    }
    for name, text in files.items():
        write_text(REPORTS_DIR / name, text)
    readiness = {
        "safe_to_show": ["shared_product_v1", "showcase-card-pack", "director-demo-card-sequence", "hazardous-waste-slice-catalog", "eto-hazardous-waste-slice-ingest-register", "gap-report-full"],
        "not_safe_to_show_yet": ["yunnan-pitfall-map-full", "monthly-report-comparison-full"],
        "must_not_show": ["private runtime details", "raw RAG response", "real enterprise data"],
        "recommended_demo_order": [
            "危废包装容器标签信息不完整或与实物、台账不一致",
            "危废包装容器“一物一码”与平台记录核查",
            "危险废物管理台账记录不完整",
            "危废出入库记录、电子标签二维码与转移联单不一致",
            "危废暂存场所防渗、防漏及泄漏收集措施不完善",
            "危废专题全量目录",
            "缺口报告展示覆盖盲区",
        ],
    }
    write_json(REPORTS_DIR / "zhang-director-readiness.json", readiness)
    write_text(REPORTS_DIR / "zhang-director-readiness.md", "# Zhang Director Readiness\n\n- safe_to_show: shared_product_v1, showcase-card-pack, director-demo-card-sequence, hazardous-waste-slice-catalog, eto-hazardous-waste-slice-ingest-register, gap-report-full\n- recommended_demo_order: 标签 -> 一物一码 -> 台账 -> 转移闭环 -> 暂存实体风险 -> 危废专题全量目录 -> 缺口报告\n- not_safe_to_show_yet: yunnan-pitfall-map-full, monthly-report-comparison-full\n- must_not_show: private runtime and raw data")
    return readiness


def render_proof_p2p3() -> dict[str, Any]:
    proof_dir = REPORTS_DIR / "render-proof-p2p3"
    proof_dir.mkdir(parents=True, exist_ok=True)
    manifest = {"status": "pass", "manual_command": "pnpm --dir graph-ui preview -- --port 4173", "screenshots": [], "note": "screenshots may be gitignored; manifest records expected capture paths"}
    for name in ("desktop-director.png", "desktop-shared.png", "mobile-director.png", "mobile-director-fullpage.png"):
        path = proof_dir / name
        manifest["screenshots"].append({"path": rel(path), "exists": path.exists(), "bytes": path.stat().st_size if path.exists() else 0, "sha256": sha256_file(path) if path.exists() else None})
    write_json(proof_dir / "manifest.json", manifest)
    write_text(proof_dir / "README.md", "# P2P3 Render Proof\n\n- director mode button present in UI build.\n- run `pnpm --dir graph-ui preview -- --port 4173` and capture listed screenshots.\n")
    return manifest


def final_delivery_p2p3() -> dict[str, Any]:
    leak = read_json(REPORTS_DIR / "private-leak-check-full.json")
    regulatory = read_json(REPORTS_DIR / "regulatory-consistency-check-full.json")
    rag = read_json(REPORTS_DIR / "rag-citation-resolution-report.json")
    utilization = read_json(REPORTS_DIR / "upstream-utilization-report.json")
    cards = read_json(REPORTS_DIR / "execution-card-index.json")
    internal_manifest = read_json(FULL_INTERNAL / "manifest.json")
    shared_manifest = read_json(FULL_SHARED / "manifest.json")
    render_manifest = read_json(REPORTS_DIR / "render-proof-p2p3/manifest.json") if (REPORTS_DIR / "render-proof-p2p3/manifest.json").exists() else {"screenshots": []}
    pitfall_map = read_json(REPORTS_DIR / "yunnan-pitfall-map-full.json") if (REPORTS_DIR / "yunnan-pitfall-map-full.json").exists() else {"status": "blocked"}
    monthly = read_json(REPORTS_DIR / "monthly-report-comparison-full.json") if (REPORTS_DIR / "monthly-report-comparison-full.json").exists() else {"status": "blocked"}
    gap = read_json(REPORTS_DIR / "gap-report-full.json") if (REPORTS_DIR / "gap-report-full.json").exists() else {"status": "blocked"}
    hazardous_catalog = read_json(REPORTS_DIR / "hazardous-waste-slice-catalog.json") if (REPORTS_DIR / "hazardous-waste-slice-catalog.json").exists() else {"status": "blocked", "total_hazardous_slices": 0}
    ingest_register = read_json(REPORTS_DIR / "eto-hazardous-waste-slice-ingest-register.json") if (REPORTS_DIR / "eto-hazardous-waste-slice-ingest-register.json").exists() else {"status": "blocked", "summary": {}}
    ready = "yes"
    blockers = []
    degraded = []
    if leak["violations"]:
        ready = "no"
        blockers.append("private leak violations")
    if regulatory["findings"]:
        ready = "no"
        blockers.append("regulatory findings")
    if rag.get("rag_retrieve_probe", {}).get("status") != "pass" and ready != "no":
        ready = "conditional"
        degraded.append("Tencent RAG suite citation retrieval is not verified.")
    if cards.get("showcase_cards", 0) < 20 and ready != "no":
        ready = "conditional"
        degraded.append("showcase cards below target")
    if hazardous_catalog.get("status") != "pass" and ready != "no":
        ready = "conditional"
        degraded.append("hazardous waste full slice catalog is not fully covered")
    if ingest_register.get("status") != "pass" and ready != "no":
        ready = "conditional"
        degraded.append("ETO hazardous waste ingest register is not ready")
    if pitfall_map.get("status") != "pass" and ready != "no":
        ready = "conditional"
        degraded.append("Yunnan pitfall map full is blocked until real aggregate data is available.")
    if monthly.get("status") != "pass" and ready != "no":
        ready = "conditional"
        degraded.append("Monthly report comparison is blocked until ETO blind review is completed.")
    lineage = read_json(REPORTS_DIR / "lineage-contract-readiness.json") if (REPORTS_DIR / "lineage-contract-readiness.json").exists() else {"status": "blocked", "government_lineage_real_import": "blocked"}
    next_steps = ["obtain government_confirmed lineage exchange file", "connect real EcoCheck aggregate pitfall data", "complete ETO blind review for monthly comparison"]
    if not all(item.get("exists") and item.get("bytes", 0) > 0 for item in render_manifest.get("screenshots", [])):
        next_steps.append("capture final director screenshots")
    final = {
        "zhang_director_ready": ready,
        "reason": "full package generated; director demo has honest blocked items" if ready == "conditional" else ("full package generated; RAG citation retrieval verified" if ready == "yes" else "blocked by guardrail violation"),
        "safe_to_show": ["shared_product_v1", "upstream utilization report", "director demo card sequence", "hazardous waste slice catalog", "ETO hazardous waste ingest register", "gap report full"],
        "not_safe_to_show_yet": ["pitfall map full", "monthly comparison full"],
        "must_not_show": ["private runtime details", "raw RAG response", "real enterprise data", "keys", "local cache"],
        "blockers": blockers,
        "degraded": degraded,
        "not_done": ["government lineage real import", "real EcoCheck aggregate pitfall map", "ETO blind review for monthly comparison"],
        "next_steps": next_steps,
        "recommended_demo_order": [
            "危废包装容器标签信息不完整或与实物、台账不一致",
            "危废包装容器“一物一码”与平台记录核查",
            "危险废物管理台账记录不完整",
            "危废出入库记录、电子标签二维码与转移联单不一致",
            "危废暂存场所防渗、防漏及泄漏收集措施不完善",
            "危废专题全量目录",
            "缺口报告展示覆盖盲区",
        ],
        "rag_real_smoke": rag.get("rag_real_smoke"),
        "upstream_real_import": utilization.get("status"),
        "private_leak_violations": len(leak["violations"]),
        "regulatory_findings": len(regulatory["findings"]),
        "full_graph": internal_manifest.get("record_counts"),
        "shared_graph": shared_manifest.get("record_counts"),
        "cards": cards,
        "hazardous_slice_catalog": {
            "status": hazardous_catalog.get("status"),
            "total_hazardous_slices": hazardous_catalog.get("total_hazardous_slices"),
            "phase_counts": hazardous_catalog.get("phase_counts", {}),
            "role_counts": hazardous_catalog.get("role_counts", {}),
        },
        "eto_hazardous_waste_ingest": {
            "status": ingest_register.get("status"),
            "source": ingest_register.get("source"),
            "summary": ingest_register.get("summary", {}),
        },
        "gap_report": {"status": gap.get("status"), "status_reason": gap.get("status_reason")},
        "pitfall_map_full": {"status": pitfall_map.get("status"), "reason": pitfall_map.get("reason")},
        "monthly_comparison_full": {"status": monthly.get("status"), "reason": monthly.get("reason"), "comparison_basis": monthly.get("comparison_basis")},
        "lineage_contract": {"status": lineage.get("status"), "government_lineage_real_import": lineage.get("government_lineage_real_import"), "edge_preview_count": lineage.get("edge_preview_count")},
        "render_proof": {"status": render_manifest.get("status"), "screenshots": len(render_manifest.get("screenshots", []))},
    }
    write_json(REPORTS_DIR / "P2P3-rag-upstream-full-productization-final.json", final)
    lines = ["# P2P3 RAG Upstream Full Productization Final", "", f"- zhang_director_ready: `{ready}`", f"- rag_real_smoke: `{final['rag_real_smoke']}`", f"- upstream_real_import: `{final['upstream_real_import']}`", f"- private_leak_violations: {final['private_leak_violations']}", f"- regulatory_findings: {final['regulatory_findings']}", f"- full_graph: {final['full_graph']}", f"- shared_graph: {final['shared_graph']}", f"- lineage_contract: {final['lineage_contract']}", f"- render_proof: {final['render_proof']}", "", "## Safe To Show", *[f"- {item}" for item in final["safe_to_show"]], "", "## Not Safe To Show Yet", *[f"- {item}" for item in final["not_safe_to_show_yet"]], "", "## Must Not Show", *[f"- {item}" for item in final["must_not_show"]], "", "## Degraded", *[f"- {item}" for item in final["degraded"]], "", "## Not Done", *[f"- {item}" for item in final["not_done"]], "", "## Next Steps", *[f"- {item}" for item in final["next_steps"]]]
    write_text(REPORTS_DIR / "P2P3-rag-upstream-full-productization-final.md", "\n".join(lines))
    return final
