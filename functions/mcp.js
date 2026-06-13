const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const SERVER_INFO = {
  name: "asaptic-sourcing",
  version: "1.0.0"
};

const TOOLS = [
  "list_sourcing_lanes",
  "get_lane_capability",
  "get_engagement",
  "submit_rfq"
];

const LANES = [
  {
    id: "clinical-bioimpedance",
    sources: "clinical bioimpedance/body-composition analysers",
    markets: ["CA", "AU", "UK", "EU"],
    compliance: ["MDALL", "ARTG", "CE MDR", "ISO13485"],
    notes: "Principal-reseller sourcing with regulatory verification and compliance documentation.",
    page: "https://asaptic.com/sourcing/clinical-devices.html"
  },
  {
    id: "remote-patient-monitoring",
    sources: "RPM/connected-health devices",
    markets: ["US", "EU", "UK", "Global-South"],
    compliance: ["FDA 510k", "CE MDR", "ISO13485"],
    notes: "Connected-health sourcing with regulatory, QA, and cybersecurity document checks.",
    page: "https://asaptic.com/blog/source-remote-patient-monitoring-rpm-devices-china.html"
  },
  {
    id: "tfln-photonics",
    sources: "TFLN/LNOI wafers + EO modulators",
    markets: ["US", "EU", "GB", "CA", "AU"],
    compliance: ["EAR99", "export-screen"],
    notes: "Deep-tech photonics sourcing with end-user and export-control screening.",
    page: "https://asaptic.com/deep-tech-sourcing.html"
  },
  {
    id: "energy-solar-bess",
    sources: "solar/hybrid inverters, LFP BESS, EV chargers",
    markets: ["Gulf", "Lusophone", "Global-South"],
    compliance: ["SABER/SASO", "INMETRO", "CE", "IEC62109"],
    notes: "Energy sourcing for Gulf, Lusophone, and Global-South deployments.",
    page: "https://asaptic.com/blog/source-solar-inverters-bess-gulf-lusophone.html"
  },
  {
    id: "ai-cold-plates",
    sources: "AI data-center liquid cold plates/CDUs",
    markets: ["US", "EU", "global"],
    compliance: ["C11000", "helium-leak", "flatness"],
    notes: "Thermal-management sourcing with material, leak-test, and flatness checks.",
    page: "https://asaptic.com/blog/source-ai-data-center-cold-plates-china.html"
  },
  {
    id: "gan-power",
    sources: "GaN power devices + chargers",
    markets: ["US", "EU", "global"],
    compliance: ["EAR99", "MOFCOM gallium licence", "CE/FCC"],
    notes: "Power GaN sourcing with shipment-level export-control review.",
    page: "https://asaptic.com/blog/source-gan-power-devices-china.html"
  },
  {
    id: "na-ion-bess",
    sources: "sodium-ion cells + BESS",
    markets: ["Global-South", "telecom", "off-grid"],
    compliance: ["IEC62619", "UN3551/3552", "CE/UL"],
    notes: "Sodium-ion sourcing for telecom, off-grid, and cold-climate use cases.",
    page: "https://asaptic.com/deep-tech-sourcing.html"
  },
  {
    id: "humanoid-actuators",
    sources: "harmonic drives, joint modules, torque motors",
    markets: ["US", "EU", "global"],
    compliance: ["CE", "RoHS"],
    notes: "Physical-AI actuator sourcing with QA and compliance document review.",
    page: "https://asaptic.com/blog/source-humanoid-robot-actuators-china.html"
  },
  {
    id: "tactile-eskin",
    sources: "tactile e-skin + force-sensor arrays",
    markets: ["EU-first", "global", "prosthetics"],
    compliance: ["verify HS dual-use"],
    notes: "Force-sensor sourcing with HS and dual-use review before procurement.",
    page: "https://asaptic.com/blog/source-tactile-eskin-force-sensors-china.html"
  },
  {
    id: "ev-charger-modules",
    sources: "EV-charger SiC power modules",
    markets: ["EU", "US", "global"],
    compliance: ["CE", "ISO15118", "DIN70121"],
    notes: "DC fast-charge module sourcing with protocol and CE checks.",
    page: "https://asaptic.com/blog/source-ev-charger-power-modules-china.html"
  }
];

const TOOL_DEFINITIONS = [
  {
    name: "list_sourcing_lanes",
    description: "List Asaptic sourcing lanes with source category and target markets.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "get_lane_capability",
    description: "Return full sourcing detail for one lane.",
    inputSchema: {
      type: "object",
      properties: {
        lane_id: { type: "string" }
      },
      required: ["lane_id"],
      additionalProperties: false
    }
  },
  {
    name: "get_engagement",
    description: "Return Asaptic engagement model and RFQ response SLA.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "submit_rfq",
    description: "Acknowledge an RFQ submission for Asaptic sourcing.",
    inputSchema: {
      type: "object",
      properties: {
        product: { type: "string" },
        quantity: { type: "string" },
        target_market: { type: "string" },
        buyer_contact: { type: "string" }
      },
      required: ["product", "quantity", "target_market", "buyer_contact"],
      additionalProperties: false
    }
  }
];

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json"
    }
  });
}

function rpcResult(id, result) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result
  };
}

function rpcError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message }
  };
}

function textToolResult(result) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result)
      }
    ]
  };
}

function listSourcingLanes() {
  return LANES.map(({ id, sources, markets }) => ({ id, sources, markets }));
}

function getLaneCapability(args = {}) {
  const lane = LANES.find((item) => item.id === args.lane_id);
  if (!lane) {
    throw new Error("Unknown lane_id");
  }
  return lane;
}

function getEngagement() {
  return {
    model: "principal-reseller, factory-direct, deposit-first",
    payment_terms: "30% deposit on proforma invoice; 70% balance against bill of lading",
    contact: "engage@asaptic.com",
    response_sla: "RFQs answered within 4 hours"
  };
}

function shortId() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function submitRfq(args = {}) {
  return {
    received: true,
    reference: `RFQ-${shortId()}`,
    next: "Asaptic will respond to buyer_contact within 4 hours; or email engage@asaptic.com",
    echo: args
  };
}

function callTool(name, args) {
  if (name === "list_sourcing_lanes") {
    return listSourcingLanes();
  }
  if (name === "get_lane_capability") {
    return getLaneCapability(args);
  }
  if (name === "get_engagement") {
    return getEngagement();
  }
  if (name === "submit_rfq") {
    return submitRfq(args);
  }
  throw new Error("Unknown tool");
}

function handleRpc(message) {
  const id = message && Object.prototype.hasOwnProperty.call(message, "id") ? message.id : null;

  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(id, -32600, "Invalid Request");
  }

  if (message.method === "initialize") {
    return rpcResult(id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO
    });
  }

  if (message.method === "tools/list") {
    return rpcResult(id, {
      tools: TOOL_DEFINITIONS
    });
  }

  if (message.method === "tools/call") {
    const params = message.params || {};
    try {
      return rpcResult(id, textToolResult(callTool(params.name, params.arguments || {})));
    } catch (error) {
      return rpcError(id, -32602, error.message || "Invalid params");
    }
  }

  return rpcError(id, -32601, "Method not found");
}

export async function onRequestPost({ request }) {
  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse(rpcError(null, -32700, "Parse error"), 400);
  }

  return jsonResponse(handleRpc(payload));
}

export function onRequestGet() {
  return jsonResponse({
    name: SERVER_INFO.name,
    description: "Minimal Asaptic Sourcing MCP server over Streamable HTTP.",
    transport: "streamable-http",
    endpoint: "https://asaptic.com/mcp",
    tools: TOOLS,
    docs: "https://asaptic.com/llms-full.txt"
  });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}
