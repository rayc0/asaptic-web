'use strict';
(function () {

  var STR = {
    en: {
      docTitle: 'Robot Arm — Preliminary User Manual',
      prelim: 'PRELIMINARY — final manual ships with hardware',
      printBtn: 'Print / Save as PDF',
      closeBtn: 'Close',
      generated: 'Generated',
      coverSubtitle: 'Preliminary User Manual',
      coverConfigLabel: 'Configuration',
      coverSite: 'asaptic.com',
      s1: '1. Configuration summary',
      s1TemplateLabel: 'Template',
      s1Joints: 'joints',
      s1Payload: 'Payload',
      s1Reach: 'Reach',
      s1MovingMass: 'Est. moving mass',
      s1StructMass: 'Arm structure (first-pass)',
      s1ModTableGroup: 'Joint group',
      s1ModTableCount: 'Qty',
      s1ModTableTier: 'Module',
      s1ModTableRated: 'Rated torque',
      s1ModTableReq: 'Required torque',
      s1ModTableStatus: 'Status',
      s1OptionsHeading: 'Selected options',
      s1NoOptions: 'No options selected.',
      s2: '2. First-pass sizing results',
      s2Intro: 'Every figure above comes from a published static-sizing formula and a fixed component table — no AI estimation is involved. Status is a first-pass gravity check, not a dynamic validation:',
      s2Green: 'Passes first-pass check — rated torque is at least 1.2× the required torque.',
      s2Amber: 'Tight — review with us — rated torque meets the requirement but with less than 1.2× margin.',
      s2Red: 'Undersized — rated torque is below the required torque for this configuration.',
      s2Note: 'High-speed or high-inertia moves can require 2–3× margin beyond this static check. Our engineering review covers full dynamic sizing before you order.',
      s3: '3. Assembly overview',
      s3Intro: 'General mounting order for a joint-module arm. Exact fastener torques, cable lengths, and connector pinouts are specified in the manual shipped with your hardware.',
      s3Steps: [
        'Secure the base plinth to a rigid mounting surface before fitting any joint module.',
        'Mount the shoulder joint group(s) to the base, following the shipped fastener-torque spec.',
        'Fit the elbow joint group and connect its harness to the shoulder group.',
        'Fit the wrist joint group(s) and connect the tool-side harness.',
        'Mount the end-of-arm tool (gripper / sensor) to the wrist flange.',
        'Route all cabling along the documented service loops — avoid tight bends at any joint.',
        'Mount the controller box off-arm, in a ventilated enclosure per the shipped wiring diagram.',
        'Do not power on until every fastener is torqued to the shipped specification.'
      ],
      s4: '4. First power-on checklist',
      s4Items: [
        'Mounting surface and base plinth are rigid — no flex under full-reach load.',
        'Emergency-stop circuit is wired and tested before any powered motion.',
        'The full working envelope is clear of people and obstructions.',
        'Configured payload does not exceed the payload used to size this build.',
        'Speed and acceleration limits are set conservatively for the first cycles.',
        'No person is inside the arm envelope during powered test moves.',
        'Firmware and servo/drive configuration match the sheet shipped with your hardware.',
        'The first automated cycle is logged and reviewed before continuous operation.'
      ],
      s5: '5. Operation limits',
      s5Intro: 'These limits reflect the configuration on this document. Operating beyond them invalidates the first-pass sizing above.',
      s5Payload: 'Do not exceed the configured payload of',
      s5Reach: 'Do not operate beyond the configured reach of',
      s5Dynamic: 'Dynamic and high-speed moves reduce the effective torque margin — see the sizing table in Section 2 before increasing speed or acceleration limits.',
      s6: '6. Maintenance schedule',
      s6TableInterval: 'Interval',
      s6TableTask: 'Task',
      s6Rows: [
        ['Daily', 'Visual check: cabling, fasteners, and end-of-arm tooling for visible damage or looseness.'],
        ['Monthly', 'Fastener torque spot-check and cable-routing inspection at every joint.'],
        ['Every 6 months', 'Reducer and joint-module inspection per the shipped maintenance spec.'],
        ['Annually', 'Full service — joint modules, controller, and cabling — per the shipped maintenance spec.']
      ],
      s6Note: 'This is a generic schedule. Duty cycle, payload, and environment can shorten these intervals — the manual shipped with your hardware gives the model-specific schedule.',
      s7: '7. Safety',
      s7Items: [
        'This arm is a partially completed machine: risk assessment, safeguarding, and compliance are application-specific and are the integrator’s responsibility, in line with ISO 10218 and ISO/TS 15066 guidance on industrial and collaborative robots.',
        'Fit and test an emergency-stop circuit before any powered motion.',
        'Use lockout/tagout procedures before any maintenance or manual intervention.',
        'Do not modify joint modules, wiring, or firmware outside documented procedures.',
        'Speed-and-separation or power-and-force-limiting measures depend on your specific application and layout — see the compliance chapter of the Robotics Handbook for the relevant considerations.'
      ],
      s7ComplianceLink: 'Robotics Handbook — compliance chapter',
      s8: '8. Support',
      s8Intro: 'Questions about this configuration or your build request:',
      s8Email: 'engage@asaptic.com',
      s8HandbookLink: 'Robotics Handbook — Robot 101',
      s8Disclaimer: 'This is a preliminary document generated automatically from an indicative configuration. It is not a substitute for the product manual shipped with the hardware, and carries no certification or compliance claim.',
      statusLabels: { green: 'Passes first-pass check', amber: 'Tight — review with us', red: 'Undersized' },
      testCycleLabel: 'Test cycle'
    },
    zh: {
      docTitle: '机械臂 — 初步用户手册',
      prelim: '初步版本 — 最终手册将随硬件一同发货',
      printBtn: '打印 / 另存为 PDF',
      closeBtn: '关闭',
      generated: '生成日期',
      coverSubtitle: '初步用户手册',
      coverConfigLabel: '配置方案',
      coverSite: 'asaptic.com',
      s1: '1. 配置摘要',
      s1TemplateLabel: '机型模板',
      s1Joints: '关节',
      s1Payload: '负载',
      s1Reach: '臂展',
      s1MovingMass: '预估运动质量',
      s1StructMass: '臂体结构（初步估算）',
      s1ModTableGroup: '关节组',
      s1ModTableCount: '数量',
      s1ModTableTier: '模组',
      s1ModTableRated: '额定扭矩',
      s1ModTableReq: '需求扭矩',
      s1ModTableStatus: '状态',
      s1OptionsHeading: '已选配件',
      s1NoOptions: '未选择任何配件。',
      s2: '2. 初步校核结果',
      s2Intro: '以上所有数值均来自公开的静态校核公式与固定组件表 — 不涉及任何 AI 估算。状态为初步重力校核结果，并非动态验证：',
      s2Green: '通过初步校核 — 额定扭矩不低于需求扭矩的 1.2 倍。',
      s2Amber: '偏紧 · 建议复核 — 额定扭矩满足需求，但余量不足 1.2 倍。',
      s2Red: '规格不足 — 该配置下额定扭矩低于需求扭矩。',
      s2Note: '高速或高惯量动作可能需要超出本静态校核 2–3 倍的余量。下单前，我们的工程团队将提供完整的动态校核。',
      s3: '3. 装配概览',
      s3Intro: '模组化机械臂的一般安装顺序。具体紧固扭矩、线缆长度及接插件针脚定义，以随硬件发货的手册为准。',
      s3Steps: [
        '在安装任何关节模组前，先将底座牢固固定于刚性安装面。',
        '按发货紧固扭矩规范，将肩关节组安装至底座。',
        '安装肘关节组，并连接其与肩关节组之间的线束。',
        '安装腕关节组，并连接工具侧线束。',
        '将末端执行器（夹爪 / 传感器）安装至腕部法兰。',
        '按文档规定的走线余量布线 — 避免任何关节处出现急弯。',
        '控制柜应安装于臂体之外的通风位置，并按发货接线图施工。',
        '所有紧固件按发货规范拧紧扭矩后，方可通电。'
      ],
      s4: '4. 首次通电检查清单',
      s4Items: [
        '安装面与底座刚性良好 — 满臂展负载下无明显形变。',
        '急停回路已接线并在通电动作前完成测试。',
        '完整工作空间内无人员与障碍物。',
        '所配置负载未超过本次校核所用的负载值。',
        '首次运行的速度与加速度限制已保守设置。',
        '通电测试动作期间，工作空间内无人员。',
        '固件与伺服/驱动配置与随硬件发货的说明一致。',
        '首个自动化循环已记录并复核，方可投入连续运行。'
      ],
      s5: '5. 运行限制',
      s5Intro: '以下限制对应本文档所示配置。超出限制运行将使上述初步校核结果失效。',
      s5Payload: '请勿超过所配置的负载：',
      s5Reach: '请勿超出所配置的臂展：',
      s5Dynamic: '动态及高速动作会降低实际扭矩余量 — 提高速度或加速度限制前，请参阅第 2 节的校核表。',
      s6: '6. 维护计划',
      s6TableInterval: '周期',
      s6TableTask: '维护内容',
      s6Rows: [
        ['每日', '目视检查：线缆、紧固件及末端工具是否存在可见损伤或松动。'],
        ['每月', '对每个关节进行紧固扭矩抽检及走线检查。'],
        ['每 6 个月', '按发货维护规范检查减速器及关节模组。'],
        ['每年', '按发货维护规范对关节模组、控制器及线缆进行全面保养。']
      ],
      s6Note: '本计划为通用参考。实际工作负载、负载大小及使用环境可能缩短上述周期 — 随硬件发货的手册将提供该型号的具体维护计划。',
      s7: '7. 安全须知',
      s7Items: [
        '本机械臂属于部分成套机械：风险评估、安全防护与合规评估需结合具体应用场景，由系统集成方负责，并应参照 ISO 10218 与 ISO/TS 15066 关于工业及协作机器人的相关指南。',
        '通电动作前，须安装并测试急停回路。',
        '任何维护或人工介入操作前，须执行上锁挂牌（LOTO）程序。',
        '不得在文档规定流程之外，擅自改装关节模组、线路或固件。',
        '安全距离监测或功率与力限制等具体安全措施，取决于您的具体应用与布局 — 相关考量请参阅《机器人手册》合规章节。'
      ],
      s7ComplianceLink: '机器人手册 — 合规章节',
      s8: '8. 支持与联系',
      s8Intro: '如对本配置或您的搭建请求有任何疑问：',
      s8Email: 'engage@asaptic.com',
      s8HandbookLink: '机器人手册 — Robot 101',
      s8Disclaimer: '本文档为根据示意性配置自动生成的初步文件，不能替代随硬件发货的正式产品手册，亦不构成任何认证或合规声明。',
      statusLabels: { green: '通过初步校核', amber: '偏紧 · 建议复核', red: '规格不足' },
      testCycleLabel: '测试循环'
    }
  };

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtNum(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return (Math.round(n * 10) / 10).toString();
  }

  function statusColor(level) {
    if (level === 'green') return '#2E7D42';
    if (level === 'amber') return '#8A5B00';
    if (level === 'red') return '#BE3A2B';
    return '#191B1E';
  }

  function buildManualHtml(o) {
    var lang = (o && o.lang === 'zh') ? 'zh' : 'en';
    var t = STR[lang];
    var htmlLang = lang === 'zh' ? 'zh-Hans' : 'en';

    var generated = esc(o.generated || '');
    var templateLabel = esc(o.template && o.template.label || '');
    var jointCount = (o.template && o.template.jointCount !== undefined) ? o.template.jointCount : '';
    var payload = fmtNum(o.payload);
    var reach = fmtNum(o.reach);
    var movingMass = fmtNum(o.movingMass);
    var armStructureMass = fmtNum(o.armStructureMass);

    var groups = (o.groups || []).map(function (g) {
      var lvl = g.statusLevel || 'green';
      var col = statusColor(lvl);
      var label = esc(g.statusLabel || t.statusLabels[lvl] || '');
      return '<tr>' +
        '<td>' + esc(g.label) + '</td>' +
        '<td class="num">' + esc(g.count) + '</td>' +
        '<td>' + esc(g.tierName) + '</td>' +
        '<td class="num">' + fmtNum(g.torqueRated) + ' Nm</td>' +
        '<td class="num">' + fmtNum(g.torqueRequired) + ' Nm</td>' +
        '<td><span class="status-chip" style="color:' + col + ';border-color:' + col + ';">' + label + '</span></td>' +
        '</tr>';
    }).join('');

    var options = (o.options || []).map(function (op) {
      return '<li>' + esc(op.label) + '</li>';
    }).join('');
    var optionsBlock = options
      ? '<h3>' + esc(t.s1OptionsHeading) + '</h3><ul class="plain-list">' + options + '</ul>'
      : '<h3>' + esc(t.s1OptionsHeading) + '</h3><p class="muted">' + esc(t.s1NoOptions) + '</p>';

    var s3Steps = t.s3Steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var s4Items = t.s4Items.map(function (s) { return '<li><span class="box">☐</span> ' + esc(s) + '</li>'; }).join('');
    var s6Rows = t.s6Rows.map(function (r) {
      return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>';
    }).join('');
    var s7Items = t.s7Items.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');

    var marketBlock = '';
    if (o.market && o.market.label) {
      var landed = (o.landedLow !== null && o.landedLow !== undefined && o.landedHigh !== null && o.landedHigh !== undefined)
        ? ('US$' + Math.round(o.landedLow).toLocaleString('en-US') + '–' + Math.round(o.landedHigh).toLocaleString('en-US'))
        : null;
      marketBlock = '<tr><td>' + esc(lang === 'zh' ? '目的市场' : 'Destination market') + '</td><td>' + esc(o.market.label) + (landed ? ' · ' + esc(landed) : '') + '</td></tr>';
    }
    var subtotalBlock = '';
    if (o.subtotalLow !== null && o.subtotalLow !== undefined) {
      var band = 'US$' + Math.round(o.subtotalLow).toLocaleString('en-US') + '–' + Math.round(o.subtotalHigh).toLocaleString('en-US');
      subtotalBlock = '<tr><td>' + esc(lang === 'zh' ? '预估小计（EXW 深圳）' : 'Indicative subtotal (EXW Shenzhen)') + '</td><td>' + esc(band) + '</td></tr>';
    }

    var doc =
      '<!DOCTYPE html><html lang="' + htmlLang + '"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<meta name="robots" content="noindex, nofollow">' +
      '<title>' + esc(t.docTitle) + '</title>' +
      '<style>' +
      ':root{--paper:#F6F3EC;--ink:#191B1E;--seal:#BE3A2B;--stone:#6E7378;--line:#D8D2C4;--wash:#EEE9DD;' +
      '--serif:"Source Serif 4",Georgia,"Songti SC","Noto Serif CJK SC",serif;' +
      '--body:Inter,"PingFang SC",system-ui,-apple-system,sans-serif;' +
      '--mono:"JetBrains Mono",ui-monospace,"SFMono-Regular",Menlo,monospace;}' +
      '*{box-sizing:border-box;}' +
      'body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--body);line-height:1.5;}' +
      '.doc{max-width:760px;margin:0 auto;padding:48px 32px 96px;}' +
      '.print-bar{position:fixed;top:0;left:0;right:0;background:var(--ink);color:var(--paper);' +
      'display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:10px 20px;z-index:50;}' +
      '.print-bar button{font:inherit;font-weight:650;font-size:13.5px;padding:8px 16px;border-radius:2px;' +
      'border:1px solid var(--paper);background:transparent;color:var(--paper);cursor:pointer;min-height:36px;}' +
      '.print-bar button.primary{background:var(--paper);color:var(--ink);}' +
      '.doc{margin-top:52px;}' +
      '.banner{background:var(--seal);color:#fff;text-align:center;font-family:var(--mono);' +
      'font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:8px;border-radius:2px;margin-bottom:28px;}' +
      '.cover{border:1px solid var(--line);border-radius:2px;background:var(--wash);padding:36px 28px;margin-bottom:36px;text-align:center;}' +
      '.cover h1{font-family:var(--serif);font-size:28px;margin:0 0 8px;color:var(--ink);}' +
      '.cover .subtitle{font-family:var(--mono);font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:var(--stone);margin:0 0 20px;}' +
      '.cover .meta{font-size:13.5px;color:var(--stone);margin:4px 0;}' +
      '.cover .site{font-family:var(--mono);font-size:12px;color:var(--ink);margin-top:16px;}' +
      'h2{font-family:var(--serif);font-size:19px;color:var(--ink);border-top:2px solid var(--ink);' +
      'padding-top:10px;margin:34px 0 12px;}' +
      'h3{font-family:var(--serif);font-size:15px;color:var(--ink);margin:18px 0 8px;}' +
      'p{font-size:14px;color:var(--ink);margin:0 0 10px;}' +
      'p.muted{color:var(--stone);}' +
      'table{width:100%;border-collapse:collapse;font-size:13px;margin:10px 0 16px;}' +
      'th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top;}' +
      'th{font-family:var(--mono);font-size:10.5px;text-transform:uppercase;letter-spacing:0.05em;color:var(--stone);border-bottom:2px solid var(--ink);}' +
      'td.num,th.num{text-align:right;}' +
      '.status-chip{font-family:var(--mono);font-size:10.5px;font-weight:700;letter-spacing:0.04em;' +
      'border:1px solid currentColor;border-radius:2px;padding:2px 7px;white-space:nowrap;}' +
      'ol,ul{padding-left:22px;margin:0 0 12px;}' +
      'ul.plain-list{list-style:disc;}' +
      'li{font-size:13.5px;margin-bottom:7px;color:var(--ink);}' +
      '.box{display:inline-block;width:14px;}' +
      'a{color:var(--seal);}' +
      '.disclaimer{background:var(--wash);border:1px solid var(--line);border-radius:2px;padding:14px;font-size:12.5px;color:var(--stone);margin-top:28px;}' +
      '@media print{' +
      '.print-bar{display:none !important;}' +
      '.doc{margin-top:0;padding:0 8mm;}' +
      '@page{margin:16mm 14mm;}' +
      'h2{break-after:avoid-page;}' +
      'tr,li{break-inside:avoid;}' +
      '}' +
      '</style></head><body>' +
      '<div class="print-bar">' +
      '<button type="button" class="primary" onclick="window.print()">' + esc(t.printBtn) + '</button>' +
      '<button type="button" onclick="window.close()">' + esc(t.closeBtn) + '</button>' +
      '</div>' +
      '<div class="doc">' +
      '<div class="banner">' + esc(t.prelim) + '</div>' +
      '<div class="cover">' +
      '<h1>' + esc(t.docTitle) + '</h1>' +
      '<p class="subtitle">' + esc(t.coverSubtitle) + '</p>' +
      '<p class="meta">' + esc(t.coverConfigLabel) + ': ' + templateLabel + (jointCount !== '' ? ' · ' + esc(jointCount) + ' ' + esc(t.s1Joints) : '') + '</p>' +
      '<p class="meta">' + esc(t.generated) + ': ' + generated + '</p>' +
      '<p class="site">' + esc(t.coverSite) + '</p>' +
      '</div>' +

      '<h2>' + esc(t.s1) + '</h2>' +
      '<table><tbody>' +
      '<tr><td>' + esc(t.s1TemplateLabel) + '</td><td>' + templateLabel + '</td></tr>' +
      '<tr><td>' + esc(t.s1Payload) + '</td><td>' + payload + ' kg</td></tr>' +
      '<tr><td>' + esc(t.s1Reach) + '</td><td>' + reach + ' m</td></tr>' +
      '<tr><td>' + esc(t.s1MovingMass) + '</td><td>' + movingMass + ' kg</td></tr>' +
      '<tr><td>' + esc(t.s1StructMass) + '</td><td>' + armStructureMass + ' kg</td></tr>' +
      marketBlock + subtotalBlock +
      '</tbody></table>' +
      '<table><thead><tr>' +
      '<th>' + esc(t.s1ModTableGroup) + '</th>' +
      '<th class="num">' + esc(t.s1ModTableCount) + '</th>' +
      '<th>' + esc(t.s1ModTableTier) + '</th>' +
      '<th class="num">' + esc(t.s1ModTableRated) + '</th>' +
      '<th class="num">' + esc(t.s1ModTableReq) + '</th>' +
      '<th>' + esc(t.s1ModTableStatus) + '</th>' +
      '</tr></thead><tbody>' + groups + '</tbody></table>' +
      optionsBlock +

      '<h2>' + esc(t.s2) + '</h2>' +
      '<p>' + esc(t.s2Intro) + '</p>' +
      '<ul>' +
      '<li><span class="status-chip" style="color:#2E7D42;border-color:#2E7D42;">' + esc(t.statusLabels.green) + '</span> — ' + esc(t.s2Green) + '</li>' +
      '<li><span class="status-chip" style="color:#8A5B00;border-color:#8A5B00;">' + esc(t.statusLabels.amber) + '</span> — ' + esc(t.s2Amber) + '</li>' +
      '<li><span class="status-chip" style="color:#BE3A2B;border-color:#BE3A2B;">' + esc(t.statusLabels.red) + '</span> — ' + esc(t.s2Red) + '</li>' +
      '</ul>' +
      '<p class="muted">' + esc(t.s2Note) + '</p>' +

      '<h2>' + esc(t.s3) + '</h2>' +
      '<p>' + esc(t.s3Intro) + '</p>' +
      '<ol>' + s3Steps + '</ol>' +

      '<h2>' + esc(t.s4) + '</h2>' +
      '<ul style="list-style:none;padding-left:0;">' + s4Items + '</ul>' +

      '<h2>' + esc(t.s5) + '</h2>' +
      '<p>' + esc(t.s5Intro) + '</p>' +
      '<ul>' +
      '<li>' + esc(t.s5Payload) + ' ' + payload + ' kg.</li>' +
      '<li>' + esc(t.s5Reach) + ' ' + reach + ' m.</li>' +
      '</ul>' +
      '<p class="muted">' + esc(t.s5Dynamic) + '</p>' +

      '<h2>' + esc(t.s6) + '</h2>' +
      '<table><thead><tr><th>' + esc(t.s6TableInterval) + '</th><th>' + esc(t.s6TableTask) + '</th></tr></thead>' +
      '<tbody>' + s6Rows + '</tbody></table>' +
      '<p class="muted">' + esc(t.s6Note) + '</p>' +

      '<h2>' + esc(t.s7) + '</h2>' +
      '<ul>' + s7Items + '</ul>' +
      '<p><a href="https://asaptic.com/' + (lang === 'zh' ? 'zh/' : '') + 'robot/101/compliance/">' + esc(t.s7ComplianceLink) + '</a></p>' +

      '<h2>' + esc(t.s8) + '</h2>' +
      '<p>' + esc(t.s8Intro) + ' <a href="mailto:' + esc(t.s8Email) + '">' + esc(t.s8Email) + '</a></p>' +
      '<p><a href="https://asaptic.com/' + (lang === 'zh' ? 'zh/' : '') + 'robot/101/">' + esc(t.s8HandbookLink) + '</a></p>' +
      '<div class="disclaimer">' + esc(t.s8Disclaimer) + '</div>' +

      '</div></body></html>';

    return doc;
  }

  function openOverlay(html) {
    var overlay = document.createElement('div');
    overlay.setAttribute('id', 'asaptic-manual-overlay');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;overflow:auto;';
    var iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Preliminary user manual');
    iframe.style.cssText = 'position:absolute;top:40px;left:0;right:0;bottom:0;width:100%;height:calc(100% - 40px);border:0;';
    var closeBar = document.createElement('div');
    closeBar.style.cssText = 'position:absolute;top:0;left:0;right:0;height:40px;background:#191B1E;display:flex;align-items:center;justify-content:flex-end;padding:0 14px;';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = 'font:inherit;font-weight:650;font-size:13px;padding:6px 14px;border-radius:2px;border:1px solid #F6F3EC;background:transparent;color:#F6F3EC;cursor:pointer;';
    closeBtn.addEventListener('click', function () {
      document.body.removeChild(overlay);
    });
    closeBar.appendChild(closeBtn);
    overlay.appendChild(closeBar);
    overlay.appendChild(iframe);
    document.body.appendChild(overlay);
    var doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
  }

  function open(o) {
    o = o || {};
    var html = buildManualHtml(o);
    var win = null;
    try {
      win = window.open('', '_blank');
    } catch (e) {
      win = null;
    }
    if (win && win.document) {
      try {
        win.document.open();
        win.document.write(html);
        win.document.close();
        return;
      } catch (e2) {
        // fall through to overlay
      }
    }
    openOverlay(html);
  }

  window.asapticManual = { open: open };

})();
