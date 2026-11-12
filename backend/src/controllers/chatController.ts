import { Request, Response } from 'express';
import { getScoredFacilities } from '../services/riskEngine.js';
import { getCommodities, getFacilityInventoryMap, getLgaIndicators } from '../services/dataLoader.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

function buildDataContext(userMessage: string = ''): string {
  const facilities = getScoredFacilities();
  const inventoryMap = getFacilityInventoryMap();
  const commodities = getCommodities();
  const lgaMap = getLgaIndicators();

  const total = facilities.length;
  const critical = facilities.filter(f => f.risk_tier === 'CRITICAL');
  const high = facilities.filter(f => f.risk_tier === 'HIGH');
  const medium = facilities.filter(f => f.risk_tier === 'MEDIUM');
  const low = facilities.filter(f => f.risk_tier === 'LOW');
  const silent = facilities.filter(f => f.is_silent);
  const coldChain = facilities.filter(f => f.has_cold_chain);

  // Top 15 critical facilities
  const top15Critical = critical
    .sort((a, b) => b.base_risk_score - a.base_risk_score)
    .slice(0, 15)
    .map(f => `  - [${f.nhfr_facility_code || f.facility_id}] ${f.facility_name} (${f.lga_name} LGA, ${f.state}) | Score: ${f.base_risk_score} | Staff: ${f.total_staff || 0} | Silent: ${f.is_silent ? 'YES' : 'NO'} | Cold Chain: ${f.has_cold_chain ? 'YES' : 'NO'} | Drivers: ${f.top_reason_summary || 'N/A'}`)
    .join('\n');

  // LGA vulnerability summary (top 15 by avg risk)
  const lgaRiskMap: Record<string, { total: number; count: number; state: string; critical: number; silent: number }> = {};
  for (const f of facilities) {
    if (!lgaRiskMap[f.lga_name]) lgaRiskMap[f.lga_name] = { total: 0, count: 0, state: f.state, critical: 0, silent: 0 };
    lgaRiskMap[f.lga_name].total += f.base_risk_score;
    lgaRiskMap[f.lga_name].count += 1;
    if (f.risk_tier === 'CRITICAL') lgaRiskMap[f.lga_name].critical += 1;
    if (f.is_silent) lgaRiskMap[f.lga_name].silent += 1;
  }
  const topLGAs = Object.entries(lgaRiskMap)
    .map(([lga, d]) => ({ lga, avgRisk: Math.round(d.total / d.count), state: d.state, critical: d.critical, silent: d.silent, count: d.count }))
    .sort((a, b) => b.avgRisk - a.avgRisk)
    .slice(0, 15)
    .map(l => `  - ${l.lga} LGA (${l.state}): Avg Risk ${l.avgRisk}/100, ${l.critical} critical PHCs, ${l.silent} silent, ${l.count} total PHCs`)
    .join('\n');

  // Commodity stockout summary
  const commStats: Record<string, { name: string; category: string; stockout: number; total: number; unmet: number }> = {};
  for (const comm of commodities) {
    commStats[comm.commodity_id] = { name: comm.name, category: comm.category, stockout: 0, total: 0, unmet: 0 };
  }
  for (const fac of facilities) {
    const items = inventoryMap.get(fac.facility_id) || [];
    for (const item of items) {
      if (!commStats[item.commodity_id]) {
        commStats[item.commodity_id] = { name: item.name, category: 'Essential', stockout: 0, total: 0, unmet: 0 };
      }
      commStats[item.commodity_id].total += 1;
      if (item.is_stockout || item.ending_stock <= 0) commStats[item.commodity_id].stockout += 1;
      commStats[item.commodity_id].unmet += item.unmet_demand || 0;
    }
  }
  const topStockouts = Object.values(commStats)
    .filter(c => c.total > 0)
    .map(c => ({ ...c, pct: Math.round((c.stockout / c.total) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .map(c => `  - ${c.name} (${c.category}): ${c.pct}% stockout rate (${c.stockout} of ${c.total} facilities stocked out), ${c.unmet.toLocaleString()} unmet doses`)
    .join('\n');

  // State breakdown
  const stateMap: Record<string, { count: number; critical: number; silent: number; coldChain: number }> = {};
  for (const f of facilities) {
    if (!stateMap[f.state]) stateMap[f.state] = { count: 0, critical: 0, silent: 0, coldChain: 0 };
    stateMap[f.state].count += 1;
    if (f.risk_tier === 'CRITICAL') stateMap[f.state].critical += 1;
    if (f.is_silent) stateMap[f.state].silent += 1;
    if (f.has_cold_chain) stateMap[f.state].coldChain += 1;
  }
  const stateBreakdown = Object.entries(stateMap)
    .map(([st, d]) => `  - ${st} State: ${d.count} PHCs total | ${d.critical} Critical | ${d.silent} Silent | Cold chain readiness: ${Math.round((d.coldChain / d.count) * 100)}%`)
    .join('\n');

  // --- QUERY-SPECIFIC ENTITY MATCHING (DYNAMIC GROUNDING) ---
  const queryLower = userMessage.toLowerCase();
  let dynamicContext = '';

  // 1. Check if user mentions a specific commodity/drug
  const matchedCommodities = commodities.filter(c =>
    queryLower.includes(c.name.toLowerCase()) ||
    (c.commodity_id && queryLower.includes(c.commodity_id.toLowerCase()))
  );

  if (matchedCommodities.length > 0) {
    dynamicContext += `\nSPECIFIC INVENTORY NEED FOR MENTIONED COMMODITIES:\n`;
    for (const comm of matchedCommodities) {
      // Find top facilities stocked out of this commodity with highest unmet demand & risk score
      const stockedOutFacs: Array<{ name: string; lga: string; state: string; risk: number; unmet: number }> = [];
      for (const f of facilities) {
        const items = inventoryMap.get(f.facility_id) || [];
        const item = items.find(it => it.commodity_id === comm.commodity_id);
        if (item && (item.is_stockout || item.ending_stock <= 0)) {
          stockedOutFacs.push({
            name: f.facility_name,
            lga: f.lga_name,
            state: f.state,
            risk: f.base_risk_score,
            unmet: item.unmet_demand || 0
          });
        }
      }
      stockedOutFacs.sort((a, b) => (b.risk * 100 + b.unmet) - (a.risk * 100 + a.unmet));
      dynamicContext += `Target Commodity: "${comm.name}" (${comm.category})\n`;
      dynamicContext += `Top Priority Clinics Stocked Out and Needing Allocation:\n`;
      for (const sf of stockedOutFacs.slice(0, 8)) {
        dynamicContext += `  * ${sf.name} (${sf.lga} LGA, ${sf.state}) - Base Risk Score: ${sf.risk}, Unmet Demand: ${sf.unmet.toLocaleString()} doses\n`;
      }
    }
  }

  // 2. Check if user mentions a specific LGA or State
  const matchedStates = Object.keys(stateMap).filter(st => queryLower.includes(st.toLowerCase()));
  if (matchedStates.length > 0) {
    dynamicContext += `\nSTATE-SPECIFIC DOSSIER FOR MENTIONED REGIONS:\n`;
    for (const st of matchedStates) {
      const stateFacs = facilities.filter(f => f.state.toLowerCase() === st.toLowerCase())
        .sort((a, b) => b.base_risk_score - a.base_risk_score)
        .slice(0, 6);
      dynamicContext += `${st} State Top Critical Clinics:\n`;
      for (const sf of stateFacs) {
        dynamicContext += `  * ${sf.facility_name} (${sf.lga_name} LGA) | Risk: ${sf.base_risk_score} | Silent: ${sf.is_silent ? 'YES' : 'NO'} | Staff: ${sf.total_staff || 0}\n`;
      }
    }
  }

  return `
=== REPULSE DASHBOARD — LIVE NIGERIA PHC OPERATIONAL DATASET ===

TOTAL NETWORK METRICS:
- Total Monitored PHCs: ${total}
- CRITICAL Risk (score 70-100): ${critical.length} facilities (${Math.round((critical.length / total) * 100)}%)
- HIGH Risk (score 45-69): ${high.length} facilities (${Math.round((high.length / total) * 100)}%)
- MEDIUM Risk (score 25-44): ${medium.length} facilities (${Math.round((medium.length / total) * 100)}%)
- LOW Risk (score 0-24): ${low.length} facilities (${Math.round((low.length / total) * 100)}%)
- Reporting Blackouts (silent ≥3 weeks): ${silent.length} facilities (${Math.round((silent.length / total) * 100)}%)
- Solar Cold Chain Ready: ${coldChain.length} facilities (${Math.round((coldChain.length / total) * 100)}%)

TOP 15 HIGHEST-RISK FACILITIES IN THE NATION:
${top15Critical}

TOP 15 HIGHEST VULNERABILITY LOCAL GOVERNMENT AREAS (LGAs):
${topLGAs}

ESSENTIAL COMMODITY STOCKOUT BURDEN:
${topStockouts}

STATE-BY-STATE SUMMARY:
${stateBreakdown}
${dynamicContext}
=== END OF LIVE DATASET CONTEXT ===
`.trim();
}

export async function handleChat(req: Request, res: Response) {
  try {
    const { message, history } = req.body as { message: string; history?: Array<{ role: string; text: string }> };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'AI assistant not configured. Please add GEMINI_API_KEY to backend .env' });
    }

    const dataContext = buildDataContext(message);

    const systemInstruction = `You are REMI — Repulse Epidemiological Management Intelligence — an AI decision-support engine embedded in the Repulse Nigeria Primary Healthcare dashboard.

STRICT GROUNDING & ZERO-HALLUCINATION RULES:
1. ONLY USE THE DATASET CONTEXT PROVIDED: Every number, facility name, LGA, risk score, stockout rate, and state in your response MUST be directly derived from the DATASET CONTEXT below.
2. NEVER FABRICATE DATA: Do not invent facilities, codes, stock levels, or statistics. If the user asks about an entity, metric, or drug that does not exist in the context, explicitly tell them: "That facility, region, or item is not found in the current monitored dataset."
3. RESOURCE ALLOCATION FORMULA: When an official asks where to allocate drugs or supplies (e.g., "I have 50 packs of X"):
   - Recommend the specific clinics listed under that commodity or with highest risk score and confirmed stockouts.
   - Justify your choice with: (a) base risk score, (b) stockout status, (c) unmet demand, (d) cold chain status if vaccines/cold items are involved.
4. TONE & FORMAT:
   - Act as an authoritative, concise public health logistics advisor for Nigeria's Federal Ministry of Health and State PHC Boards.
   - Use bold numbers and bullet points for readability.
   - Keep answers under 250 words unless a detailed dispatch plan is requested.

DATASET CONTEXT:
${dataContext}`;

    // Build conversation history for the API
    const contents = [];
    if (history && history.length > 0) {
      for (const h of history.slice(-6)) { // last 6 exchanges for context
        contents.push({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.text }]
        });
      }
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: {
          temperature: 0.1, // Near-zero temperature ensures strict factual consistency with zero hallucination
          maxOutputTokens: 600,
          topP: 0.8
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', errText);
      return res.status(502).json({ error: 'AI service error. Please try again.' });
    }

    const data = await response.json() as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(502).json({ error: 'Empty response from AI service.' });
    }

    res.json({ reply: text, model: 'gemini-3.8-flash' });
  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat message', message: error.message });
  }
}

