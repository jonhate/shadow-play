"""按官方模板填写《人工智能工具使用情况说明》。"""
import copy
import os
import shutil

from docx import Document
from docx.oxml.ns import qn
from docx.shared import Pt

SRC = r"C:\Users\26357\Downloads\2026年第十四届全国大参赛团队数字媒体科技作品及创意竞赛人工智能工具使用情况说明.docx"
OUTDIR = r"D:\lj\inktool\piying\提交材料\07_AI工具使用补充说明"
OUT = os.path.join(OUTDIR, "掌中戲_AI工具使用情况说明.docx")
os.makedirs(OUTDIR, exist_ok=True)
shutil.copy2(SRC, OUT)

doc = Document(OUT)


def cell_font(cell):
    for p in cell.paragraphs:
        for r in p.runs:
            return r.font.name, r.font.size, r.font.bold
    return None, None, None


def set_cell(cell, text, bold=False, size=None):
    name, sz, _ = cell_font(cell)
    # 保留第一个段落，删掉多余的
    for p in cell.paragraphs[1:]:
        p._element.getparent().remove(p._element)
    p = cell.paragraphs[0]
    for r in list(p.runs):
        r._element.getparent().remove(r._element)
    run = p.add_run(text)
    if name:
        run.font.name = name
        rPr = run._element.get_or_add_rPr()
        ea = rPr.find(qn("w:rFonts"))
        if ea is None:
            from docx.oxml import OxmlElement
            ea = OxmlElement("w:rFonts")
            rPr.append(ea)
        ea.set(qn("w:eastAsia"), name)
    run.font.size = size or sz or Pt(10.5)
    run.font.bold = bold


def set_para(para, text):
    name, sz, _ = (None, None, None)
    for r in para.runs:
        name, sz = r.font.name, r.font.size
        break
    for r in list(para.runs):
        r._element.getparent().remove(r._element)
    run = para.add_run(text)
    if name:
        run.font.name = name
    run.font.size = sz or Pt(10.5)


t0, t1, t2, t3, t4 = doc.tables

# ---------------- 表 0：基本信息与 AI 使用状态
set_cell(t0.cell(1, 1), "掌中戲 · 手势皮影")
set_cell(t0.cell(2, 1), "（以报名系统生成的编号为准）")
set_cell(t0.cell(3, 1), "（以报名信息所填赛道赛项为准）")
set_cell(t0.cell(4, 1), "□ 未使用　　☑ 已使用")

# ---------------- 表 1：主要 AI 工具及使用情况
rows1 = [
    ("AI 编程助手（大语言模型辅助编码工具）", "代码实现与调试",
     "按学生的交互设计与功能需求生成/修改代码初稿；协助定位缺陷",
     "逐项实机与脚本验证，修正坐标换算、阻尼起点、判定阈值单位等问题后采纳"),
    ("edge-tts（微软语音合成）", "台词语音生成",
     "将六出戏共 31 句台词合成为中文配音 mp3（按出目分配不同音色）",
     "决定在已配戏剧原声的剧目中默认关闭台词配音，仅保留开关；成片以原声为主"),
    ("AI 编程助手（大语言模型辅助编码工具）", "自动化回归脚本",
     "生成页面自动化检查脚本骨架（注入手部关键点、逐节拍推进、读取界面状态）",
     "由学生定义检查项与判定标准，逐条核对输出结果并据此修复问题"),
]
for i, row in enumerate(rows1):
    for j, val in enumerate(row):
        set_cell(t1.cell(i + 1, j), val)

# ---------------- 表 2：典型使用过程（环节一，随后复制两表）
def fill_process_table(tbl, data, title):
    labels = ["使用环节及目的", "主要工具（模型）", "主要输入或素材来源", "AI 主要输出",
              "学生筛选、修改或二次加工", "最终成果中的应用位置", "可核查材料（如有）"]
    for i, (lab, val) in enumerate(zip(labels, data), start=1):
        set_cell(tbl.cell(i, 1), val)
    return tbl


p1 = [
    "皮影骨架驱动与手部坐标映射：让手部关键点能正确驱动分件骨架",
    "AI 编程助手（大语言模型辅助编码工具）",
    "皮影 .woop 资产的分件/关节数据结构说明；学生提出的技术路线（二维仿射 + 两段骨骼逆解）",
    "骨架求解、逆解与逐帧矩阵更新的代码初稿",
    "学生用离线渲染脚本逐帧核对关节位置，发现“手臂只走到目标方向约四分之一”与“握拳时手臂掉下来”，"
    "定位到舞台→骨架坐标换算漏了身高补偿、以及每帧把关节角清零导致阻尼从 0 开始，修正后才真正跟手",
    "app/rig.js、app/puppet.js、app/show.js",
    "开发记录中的关节角收敛对比（0.434 → 1.855 弧度）",
]
fill_process_table(t2, p1, "环节一")

# 复制表格，追加环节二、三
anchor = t2._tbl
for title, data in [
    ("环节二：手势动作判定（作揖 / 亮相 / 甩袖 / 定格）", [
        "把双手几何量翻译成舞台动作，用于推进剧情",
        "AI 编程助手（大语言模型辅助编码工具）",
        "学生提出的动作语义（握拳=执签、两手一合=作揖、双手举高=亮相、双拳=定格）",
        "基于双手几何量的判定函数与初始阈值",
        "真机测试发现“甩袖只成功过一次”“捏着签无法作揖”“举高时手腕乱转”，反馈现象后修正："
        "甩袖阈值单位错误（把“画面宽/秒”当作“像素/秒”）、作揖增加“两手一起下压”这条路径、"
        "搓动角改用掌指关节基线并改为相对角度",
        "app/show.js 的 detectPosture / gatherInput，app/gesture.js",
        "动作判定的自动化验证记录（注入关键点逐项触发）",
    ]),
    ("环节三：台词语音生成", [
        "为六出戏生成台词配音，用于无原声剧目与自检",
        "edge-tts（微软语音合成）",
        "学生编写的台词文本与角色音色偏好",
        "31 句中文配音 mp3",
        "学生试听后决定：已配戏剧原声的剧目默认关闭台词配音，避免两层人声叠加；"
        "并在音频自检页提供逐句试听",
        "audio/lines/ 与 audio/lines.json；audiotest.html",
        "音频自检页截图与电平测试记录",
    ]),
]:
    new_tbl = copy.deepcopy(anchor)
    anchor.addnext(new_tbl)
    from docx.table import Table
    tbl_obj = Table(new_tbl, t2._parent)
    labels = ["使用环节及目的", "主要工具（模型）", "主要输入或素材来源", "AI 主要输出",
              "学生筛选、修改或二次加工", "最终成果中的应用位置", "可核查材料（如有）"]
    for i, (lab, val) in enumerate(zip(labels, data), start=1):
        set_cell(tbl_obj.cell(i, 1), val)
    anchor = new_tbl

# ---------------- 表 3：最终成果中的 AI 生成或辅助生成内容
rows3 = [
    ("程序代码（骨架驱动、逆解、手势判定、音频调度、界面）",
     "由 AI 编程助手按学生设计与需求生成初稿并迭代修改",
     "学生逐项实测、定位并修正多处逻辑与单位错误，重写关键判定",
     "可运行程序各模块"),
    ("台词配音 31 句（mp3）",
     "edge-tts 语音合成生成",
     "试听后调整用途：默认关闭，仅在无原声剧目与自检中使用",
     "audio/lines/、audiotest.html"),
    ("文字材料初稿（说明文档、PPT 文字）",
     "AI 协助整理与改写",
     "学生核对事实、删改表述、统一口径后定稿",
     "提交材料中的说明文档与 PPT"),
]
# 表 3 原有 2 个数据行，需要 3 个 → 补一行（复制最后一行的格式）
while len(t3.rows) < len(rows3) + 1:
    new_tr = copy.deepcopy(t3.rows[-1]._tr)
    t3._tbl.append(new_tr)
for i, row in enumerate(rows3):
    for j, val in enumerate(row):
        set_cell(t3.cell(i + 1, j), val)

# ---------------- 表 4：素材与版权
rows4 = [
    ("皮影资产 .woop（15 个：6 角色、3 动物、6 景片）",
     "Woooo Piying Lab（piying.woooostudio.com）",
     "皮影角色与舞台景片",
     "已获得作者授权用于本项目参赛展示与演示；第三方使用需自行确认授权范围"),
    ("戏剧原声 6 段（《牡丹亭·游园》《将军令》《夜深沉》《水龙吟》《万年欢》《良宵引》演奏录音）",
     "公开演奏录音，已取得授权",
     "六出戏的背景音乐",
     "已获授权用于本项目；仅裁取约 72 秒片段并做响度归一与淡入淡出，不改变原意"),
    ("台词语音 31 句",
     "edge-tts（微软语音合成）生成",
     "可选台词配音（当前默认关闭）",
     "按微软语音合成服务条款使用；作品不包含真人声音"),
    ("界面图形（回纹、印章、图标）与字体",
     "回纹/印章/图标为本项目自绘 SVG 与 CSS；字体为操作系统自带（微软雅黑 / Segoe UI）",
     "界面装饰与排版",
     "自绘部分随项目以 MIT 发布；字体随操作系统授权，未内嵌分发"),
]
for i, row in enumerate(rows4):
    for j, val in enumerate(row):
        set_cell(t4.cell(i + 1, j), val)

# ---------------- 第五节填空
paras = doc.paragraphs
filled = 0
for p in paras:
    t = p.text.strip()
    if t.startswith("____"):
        if filled == 0:
            set_para(p, "作品定位、交互语义与全部交互设计决策由学生完成：确定“复刻执签手感”的技术方向；"
                        "设计张手跟手 / 握拳执签 / 捏合执签 / 搓签转腕 / 作揖 / 亮相 / 甩袖 / 双拳定格的动作语义；"
                        "设计两套教学关（基础 5 步、手指模式 6 步）与“动作即台词”的剧情推进机制。")
        elif filled == 1:
            set_para(p, "开发、测试与交付由学生完成：搭建本地运行环境；逐项实测并定位缺陷（坐标换算漏身高补偿、"
                        "关节阻尼起点错误、甩袖阈值单位错误、作揖判定过严、搓动角基线退化），修复并验收；"
                        "编写自动化回归脚本验证 25 个剧情节拍、两套教学关、自动谢幕、三档皮与六种运行模式；"
                        "取得皮影资产与戏剧原声授权；完成一键启动/展馆模式/自检工具、开源发布与在线部署。")
        elif filled == 2:
            set_para(p, "AI 仅承担代码初稿生成与文字整理，不参与作品定位、交互语义与素材授权等关键决策；"
                        "AI 输出均视为草稿，须经学生核验后方可使用。")
        elif filled == 3:
            set_para(p, "所有 AI 生成代码均经学生阅读、修改与实测验证后才纳入作品；"
                        "作品中不存在由 AI 生成且未经核验的功能宣称；"
                        "AI 台词配音在已配戏剧原声的剧目中默认关闭。")
        filled += 1

doc.save(OUT)
print("已填写：", OUT, "| 填空处", filled, "个 | 表格", len(doc.tables), "张")
