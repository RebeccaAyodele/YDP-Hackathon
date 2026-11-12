import { Request, Response } from 'express';
import { getScoredFacilities } from '../services/riskEngine.js';
import { getCommodities, getFacilityInventoryMap, getLgaIndicators } from '../services/dataLoader.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

function buildDataContext(): string {
  const facilities = getScoredFacilities();
  const inventoryMap = getFacilityInventoryMap();
  const commodities = getCommodities();
  const lgaMap = getLgaIndicators();

  const total = facilities.length;
  const critical = facilities.filter(f => f.risk_tier === 'CRITICAL');
  const high = facilities.filter(f => f.risk_tier === 'HIGH');
  const silent = facilities.filter(f => f.is_silent);
  const coldChain = facilities.filter(f => f.has_cold_chain);

  // Top 15 critical facilities
  const top15Critical = critical
    .sort((a, b) => b.base_risk_score - a.base_risk_score)
    .slice(0, 15)
    .map(f => `  - ${f.facility_name} (${f.lga_name} LGA, ${f.state}) | Risk Score: ${f.base_risk_score} | Staff: ${f.total_staff || 0} | Silent: ${f.is_silent ? 'YES' : 'no'} | Cold Chain: ${f.has_cold_chain ? 'yes' : 'NO'}`)
    .join('\n');

  // LGA vulnerability summary (top 10 by avg risk)
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
    .slice(0, 10)
    .map(l => `  - ${l.lga} LGA (${l.state}): Avg Risk ${l.avgRisk}, ${l.critical} critical, ${l.silent} silent, ${l.count} PHCs`)
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
    .slice(0, 10)
    .map(c => `  - ${c.name} (${c.category}): ${c.pct}% stockout (${c.stockout}/${c.total} facilities), ${c.unmet.toLocaleString()} unmet doses`)
    .join('\n');

  // State breakdown
  const stateMap: Record<string, { count: number; critical: number; silent: number }> = {};
  for (const f of facilities) {
    if (!stateMap[f.state]) stateMap[f.state] = { count: 0, critical: 0, silent: 0 };
    stateMap[f.state].count += 1;
    if (f.risk_tier === 'CRITICAL') stateMap[f.state].critical += 1;
    if (f.is_silent) stateMap[f.state].silent += 1;
  }
  const stateBreakdown = Object.entries(stateMap)
    .map(([st, d]) => `  - ${st}: ${d.count} PHCs, ${d.critical} critical, ${d.silent} silent`)
    .join('\n');

  return `
=== REPULSE DASHBOARD — LIVE NIGERIA PHC DATASET CONTEXT ===

NETWORK SUMMARY:
- Total Monitored PHCs: ${total}
- CRITICAL Risk (score 70-100): ${critical.length} facilities
- HIGH Risk (score 45-69): ${high.length} facilities
- Reporting Blackouts (silent ≥3 weeks): ${silent.length} facilities
- Cold Chain Ready: ${coldChain.length} facilities (${Math.round((coldChain.length/total)*100)}%)

TOP 15 HIGHEST-RISK FACILITIES:
${top15Critical}

TOP 10 MOST VULNERABLE LOCAL GOVERNMENT AREAS (LGAs):
${topLGAs}

ESSENTIAL COMMODITY STOCKOUT RATES (top 10 worst):
${topStockouts}

STATE BREAKDOWN:
${stateBreakdown}

=== END OF DATASET CONTEXT ===
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

    const dataContext = buildDataContext();

    const systemInstruction = `You are REMI — Repulse Epidemiological Management Intelligence — an AI assistant embedded in the Repulse Nigeria Primary Healthcare dashboard.

You have access to real-time data from ${new Date().toLocaleDateString('en-NG', { dateStyle: 'long' })} on Nigeria's PHC network. Use the dataset context provided to give precise, actionable, data-grounded answers.

DATASET CONTEXT:
${dataContext}

GUIDELINES:
- Always ground your answers in the actual data provided above. Cite specific facility names, LGAs, states, risk scores, and stockout rates when relevant.
- For supply allocation questions (e.g. "I have X units of Y drug"), prioritize facilities with: (1) highest risk score, (2) stockout of that commodity, (3) highest unmet demand, (4) silent reporting status.
- Be concise but specific. Use bullet points for lists. Use bold for key numbers.
- Never make up data. If the answer isn't in the context, say so clearly.
- Speak like a trusted public health analyst, not a generic chatbot.
- Keep responses focused and under 300 words unless a detailed breakdown is explicitly requested.`;

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
          temperature: 0.4,
          maxOutputTokens: 600,
          topP: 0.9
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

    res.json({ reply: text, model: 'gemini-2.0-flash' });
  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat message', message: error.message });
  }
}

