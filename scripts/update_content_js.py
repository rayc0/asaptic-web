import os

filepath = "/Users/tunai/Projects/asaptic-web/content.js"
with open(filepath, "r") as f:
    content = f.read()

en_add = """
    src_title: "China Deep-Tech & Certified Components Sourcing",
    src_sub: "Factory-direct supply from verified Chinese manufacturers to Western B2B principals. Full compliance documentation. Backed by our cross-standard database spanning 854 compliance comparisons across 169 destination markets. Deposit-secured production slots. Six active sourcing lanes — from clinical devices to energy storage to Physical-AI components.",
    src_tag1: "Health Canada · TGA Certified",
    src_h1: "Clinical Devices",
    src_p1: "Bioimpedance and body-composition analyzers for hospital and aged-care procurement in Canada and Australia. MDALL + ARTG factory verification. 5-step certified sourcing process.",
    src_l1: "Clinical Device Sourcing →",
    src_tag2: "Scarce Supply · 5-Day Sample",
    src_h2: "Photonics — TFLN",
    src_p2: "Thin-film lithium niobate wafers and electro-optic modulators sourced directly from qualified Chinese foundries. In-stock 4\\" and 6\\" wafers. Sample orders fulfilled within 5 business days.",
    src_l2: "TFLN Sourcing →",
    src_tag3: "Deposit-First · 30% PI",
    src_h3: "How It Works",
    src_p3: "30% proforma deposit reserves a certified factory's production slot. Balance against Bill of Lading. Full compliance document package at shipment. Transparent process — no grey market.",
    src_l3: "Our Process →",
    src_tag4: "BESS · Inverters · EV Chargers",
    src_h4: "Energy Systems",
    src_p4: "Solar inverters, battery energy storage systems (BESS), and EV charging modules from UFLPA-compliant Chinese factories. CE, UL, and IEC-certified supply chains with full traceability documentation for Western grid and mobility markets.",
    src_l4: "Energy Sourcing →",
    src_tag5: "GaN · Na-ion · Thermal",
    src_h5: "Deep-Tech Components",
    src_p5: "GaN power electronics, sodium-ion battery cells, and advanced cold-plate thermal management modules sourced from China's deep-tech manufacturing cluster. Ideal for power conversion, next-gen energy storage, and high-density compute cooling.",
    src_l5: "Deep-Tech Sourcing →",
    src_tag6: "Actuators · E-Skin · RPM",
    src_h6: "Physical-AI & Robotics",
    src_p6: "Precision actuators, electronic-skin sensor arrays, and robotic perception modules (RPM) for embodied-AI and humanoid robot integrators. Factory-direct from China's emerging Physical-AI component ecosystem — vetted for Western OEM qualification.",
    src_l6: "Robotics Components →",
    src_l7: "Explore all sourcing lanes →",
    src_l8: "Factory-direct vs trading company: what buyers need to know →",
"""

zh_add = """
    src_title: "中国硬科技与认证部件采购",
    src_sub: "从经过验证的中国制造商直接供应给西方B2B买家。全套合规文件。由涵盖169个目的市场、854项合规比对的跨标准数据库提供支持。定金锁定产能。六大活跃采购通道——涵盖临床设备、储能系统及物理人工智能 (Physical-AI) 部件。",
    src_tag1: "加拿大卫生部 · TGA认证",
    src_h1: "临床医疗设备",
    src_p1: "专为加拿大和澳大利亚医院及养老机构采购的生物电阻抗及人体成分分析仪。工厂已获MDALL + ARTG验证。独创5步认证采购流程。",
    src_l1: "临床设备采购 →",
    src_tag2: "稀缺供应 · 5天样品交付",
    src_h2: "光子学 — 铌酸锂薄膜 (TFLN)",
    src_p2: "直接从合规的中国晶圆厂采购铌酸锂薄膜晶圆及电光调制器。4英寸及6英寸晶圆现货。样品订单5个工作日内交付。",
    src_l2: "TFLN 采购 →",
    src_tag3: "定金优先 · 30% PI",
    src_h3: "运作模式",
    src_p3: "30% 预付款定金锁定认证工厂的排产排期。见提单 (B/L) 支付尾款。发货时提供全套合规文件。全透明流程——拒绝灰色市场。",
    src_l3: "我们的流程 →",
    src_tag4: "BESS · 逆变器 · EV充电桩",
    src_h4: "能源系统",
    src_p4: "采购自符合UFLPA标准的中国工厂的太阳能逆变器、电池储能系统 (BESS) 及电动汽车充电模块。CE、UL 及 IEC 认证供应链，具备全链路追溯文件，直通西方电网与出行市场。",
    src_l4: "能源系统采购 →",
    src_tag5: "GaN · 钠离子 · 热管理",
    src_h5: "硬科技核心部件",
    src_p5: "从中国硬科技制造集群采购氮化镓 (GaN) 功率电子器件、钠离子电池电芯及先进液冷板热管理模块。是电源转换、新一代储能及高密度计算散热的理想选择。",
    src_l5: "硬科技采购 →",
    src_tag6: "执行器 · 电子皮肤 · 机器人感知",
    src_h6: "物理人工智能与机器人",
    src_p6: "专为具身智能及人形机器人集成商提供的高精度执行器、电子皮肤传感器阵列及机器人感知模块 (RPM)。中国新兴 Physical-AI 部件生态系统工厂直供——已通过西方 OEM 资格审核验证。",
    src_l6: "机器人部件采购 →",
    src_l7: "探索所有采购通道 →",
    src_l8: "工厂直供 vs 贸易公司采购：买家必知 →",
"""

zht_add = """
    src_title: "中國硬科技與認證部件採購",
    src_sub: "從經過驗證的中國製造商直接供應給西方B2B買家。全套合規文件。由涵蓋169個目的市場、854項合規比對的跨標準數據庫提供支持。定金鎖定產能。六大活躍採購通道——涵蓋臨床設備、儲能系統及物理人工智慧 (Physical-AI) 部件。",
    src_tag1: "加拿大衛生部 · TGA認證",
    src_h1: "臨床醫療設備",
    src_p1: "專為加拿大和澳大利亞醫院及養老機構採購的生物電阻抗及人體成分分析儀。工廠已獲MDALL + ARTG驗證。獨創5步認證採購流程。",
    src_l1: "臨床設備採購 →",
    src_tag2: "稀缺供應 · 5天樣品交付",
    src_h2: "光子學 — 鈮酸鋰薄膜 (TFLN)",
    src_p2: "直接從合規的中國晶圓廠採購鈮酸鋰薄膜晶圓及電光調製器。4英吋及6英吋晶圓現貨。樣品訂單5個工作日內交付。",
    src_l2: "TFLN 採購 →",
    src_tag3: "定金優先 · 30% PI",
    src_h3: "運作模式",
    src_p3: "30% 預付款定金鎖定認證工廠的排產排期。見提單 (B/L) 支付尾款。發貨時提供全套合規文件。全透明流程——拒絕灰色市場。",
    src_l3: "我們的流程 →",
    src_tag4: "BESS · 逆變器 · EV充電樁",
    src_h4: "能源系統",
    src_p4: "採購自符合UFLPA標準的中國工廠的太陽能逆變器、電池儲能系統 (BESS) 及電動汽車充電模組。CE、UL 及 IEC 認證供應鏈，具備全鏈路追溯文件，直通西方電網與出行市場。",
    src_l4: "能源系統採購 →",
    src_tag5: "GaN · 鈉離子 · 熱管理",
    src_h5: "硬科技核心部件",
    src_p5: "從中國硬科技製造集群採購氮化鎵 (GaN) 功率電子器件、鈉離子電池電芯及先進液冷板熱管理模組。是電源轉換、新一代儲能及高密度計算散熱的理想選擇。",
    src_l5: "硬科技採購 →",
    src_tag6: "執行器 · 電子皮膚 · 機器人感知",
    src_h6: "物理人工智慧與機器人",
    src_p6: "專為具身智能及人形機器人集成商提供的高精度執行器、電子皮膚傳感器陣列及機器人感知模組 (RPM)。中國新興 Physical-AI 部件生態系統工廠直供——已通過西方 OEM 資格審核驗證。",
    src_l6: "機器人部件採購 →",
    src_l7: "探索所有採購通道 →",
    src_l8: "工廠直供 vs 貿易公司採購：買家必知 →",
"""

# Inject into content.js
if "src_title:" not in content:
    # Find the end of EN
    en_end = content.find("  },\n  zh: {")
    content = content[:en_end] + en_add + content[en_end:]
    
    zh_end = content.find("  },\n  zht: {")
    content = content[:zh_end] + zh_add + content[zh_end:]
    
    zht_end = content.find("  }\n};")
    content = content[:zht_end] + zht_add + content[zht_end:]

    with open(filepath, "w") as f:
        f.write(content)
        
print("Updated content.js with sourcing translations.")
