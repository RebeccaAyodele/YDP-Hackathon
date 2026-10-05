import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  Building2, 
  Radio, 
  Search, 
  Zap, 
  RefreshCw,
  Share2,
  Package,
  ArrowRight,
  Users,
  Sun,
  Signal,
  Truck,
  HeartPulse,
  Baby
} from 'lucide-react';
import { fetchOverviewStats, fetchFacilities, fetchFacilityById, simulateCascadingRisk } from './services/api.ts';
import { Facility, OverviewStats, CascadingSimulationResponse, NeighborDetail } from './types/index.ts';
import FacilityMap from './components/FacilityMap.tsx';

export default function App() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [neighbors, setNeighbors] = useState<NeighborDetail[]>([]);
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedTier, setSelectedTier] = useState<string>('');
  const [onlySilent, setOnlySilent] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cascadingResult, setCascadingResult] = useState<CascadingSimulationResponse | null>(null);
  const [simulating, setSimulating] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, [selectedState, selectedTier, onlySilent]);

  useEffect(() => {
    if (selectedFacility) {
      fetchFacilityById(selectedFacility.facility_id)
        .then(res => setNeighbors(res.network?.neighbors || []))
        .catch(() => setNeighbors([]));
    }
  }, [selectedFacility?.facility_id]);

  async function loadData() {
    setLoading(true);
    try {
      const [statsData, facData] = await Promise.all([
        fetchOverviewStats().catch(() => null),
        fetchFacilities({ 
          state: selectedState || undefined,
          risk_tier: selectedTier || undefined,
          is_silent: onlySilent ? true : undefined,
          limit: 300
        }).catch(() => ({ facilities: [], total_count: 0, page: 1, limit: 50, total_pages: 1, filter_summary: { critical_risk: 0, high_risk: 0, medium_risk: 0, low_risk: 0, silent_facilities: 0 } }))
      ]);
      setStats(statsData);
      setFacilities(facData.facilities || []);
      if (facData.facilities?.length > 0 && !selectedFacility) {
        setSelectedFacility(facData.facilities[0]);
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSimulateCascading(facId: string) {
    setSimulating(true);
    try {
      const res = await simulateCascadingRisk(facId, 35);
      setCascadingResult(res);
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setSimulating(false);
    }
  }

  const filteredFacilities = facilities.filter(f => {
    const q = searchQuery.toLowerCase();
    return f.facility_name?.toLowerCase().includes(q) ||
           f.lga_name?.toLowerCase().includes(q) ||
           f.state?.toLowerCase().includes(q) ||
           (f.nhfr_facility_code && f.nhfr_facility_code.toLowerCase().includes(q));
  });

  return (
    <div className="app-container">
      {/* Top Header */}
      <header style={{
        background: 'rgba(15, 23, 42, 0.95)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(8px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)'
          }}>
            <Activity size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              PHC Pulse <span className="badge badge-low" style={{ fontSize: '0.65rem' }}>EARLY WARNING</span>
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Facility Risk Triage & Cascading Demand Early-Warning for Nigeria
            </p>
          </div>
        </div>

        <button 
          onClick={loadData}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            padding: '8px 14px',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Sync Data
        </button>
      </header>

      <main style={{ padding: '20px 24px', maxWidth: '1800px', margin: '0 auto', width: '100%' }}>
        {/* KPI Summary Cards */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '20px'
        }}>
          <div className="glass-panel" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Total Facilities</span>
              <Building2 size={16} color="#06b6d4" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{stats?.total_facilities || facilities.length || '—'}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Monitored across {stats?.states_count || 6} focal states
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Critical / High Risk</span>
              <AlertTriangle size={16} color="#ef4444" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f87171' }}>
              {stats ? (stats.critical_risk_count + stats.high_risk_count) : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {stats?.critical_risk_count || 0} Critical • {stats?.high_risk_count || 0} High Priority
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Silent Blind Spots</span>
              <Radio size={16} color="#f59e0b" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fbbf24' }}>
              {stats?.silent_facilities_count ?? '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Clinics missing reports (compounding decay)
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Spatial Network</span>
              <Share2 size={16} color="#8b5cf6" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>3,876 Edges</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              k=3 Haversine multi-hop topology
            </div>
          </div>
        </section>

        {/* Search & Filter Toolbar */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '16px',
          alignItems: 'center'
        }}>
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
            <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              placeholder="Search facility name, LGA, NHFR code..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
          </div>

          <select 
            value={selectedState} 
            onChange={e => setSelectedState(e.target.value)}
            style={{
              padding: '9px 12px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '0.85rem',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="">All States (6 Geopolitical Zones)</option>
            <option value="Sokoto">Sokoto (North West - High Vulnerability)</option>
            <option value="Yobe">Yobe (North East - High Vulnerability)</option>
            <option value="Ebonyi">Ebonyi (South East)</option>
            <option value="Plateau">Plateau (North Central)</option>
            <option value="Bayelsa">Bayelsa (South South - Riverine)</option>
            <option value="Lagos">Lagos (South West - Urban Benchmark)</option>
          </select>

          <select 
            value={selectedTier} 
            onChange={e => setSelectedTier(e.target.value)}
            style={{
              padding: '9px 12px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '0.85rem',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="">All Risk Tiers</option>
            <option value="CRITICAL">Critical Risk (70-100)</option>
            <option value="HIGH">High Risk (50-69)</option>
            <option value="MEDIUM">Medium Risk (30-49)</option>
            <option value="LOW">Low Risk (0-29)</option>
          </select>

          <button
            onClick={() => setOnlySilent(!onlySilent)}
            style={{
              padding: '9px 14px',
              background: onlySilent ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-secondary)',
              border: `1px solid ${onlySilent ? 'var(--risk-medium)' : 'var(--border-subtle)'}`,
              borderRadius: '8px',
              color: onlySilent ? '#fbbf24' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600
            }}
          >
            {onlySilent ? '⚡ Showing Silent Only' : 'Filter Silent Facilities'}
          </button>
        </div>

        {/* 3-Column Unified Dashboard Layout: Triage List + Live Interactive Map + Selected Facility Dossier */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr 400px',
          gap: '16px',
          height: '780px'
        }}>
          {/* Column 1: Triage Ranked Facilities List */}
          <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '0.92rem', fontWeight: 700 }}>
                Triage List ({filteredFacilities.length})
              </h2>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Ranked by Risk</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {filteredFacilities.slice(0, 50).map(fac => {
                const isSelected = selectedFacility?.facility_id === fac.facility_id;
                const tierClass = fac.risk_tier === 'CRITICAL' ? 'badge-critical' 
                                : fac.risk_tier === 'HIGH' ? 'badge-high' 
                                : fac.risk_tier === 'MEDIUM' ? 'badge-medium' : 'badge-low';
                return (
                  <div 
                    key={fac.facility_id}
                    onClick={() => { setSelectedFacility(fac); setCascadingResult(null); }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                      border: `1px solid ${isSelected ? 'var(--emerald-500)' : 'var(--border-subtle)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, paddingRight: '8px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.86rem', color: '#fff', lineHeight: '1.2' }}>{fac.facility_name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {fac.lga_name}, {fac.state}
                        </div>
                      </div>
                      <span className={`badge ${tierClass}`} style={{ fontSize: '0.62rem' }}>
                        {fac.base_risk_score}
                      </span>
                    </div>

                    <div style={{ marginTop: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                      {fac.top_reason_summary}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Column 2: The Interactive Geospatial Map (Always Centered & Visible) */}
          <div style={{ height: '100%', minHeight: '500px' }}>
            <FacilityMap
              facilities={filteredFacilities}
              selectedFacility={selectedFacility}
              neighbors={neighbors}
              cascadingResult={cascadingResult}
              onSelectFacility={fac => {
                setSelectedFacility(fac);
                setCascadingResult(null);
              }}
            />
          </div>

          {/* Column 3: Deep-Dive Facility Dossier & Cascading Simulator */}
          <div className="glass-panel" style={{ padding: '18px', overflowY: 'auto', height: '100%' }}>
            {selectedFacility ? (
              <div>
                <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                      NHFR: {selectedFacility.nhfr_facility_code || selectedFacility.facility_id}
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span className={`badge ${selectedFacility.risk_tier === 'CRITICAL' ? 'badge-critical' : selectedFacility.risk_tier === 'HIGH' ? 'badge-high' : 'badge-low'}`} style={{ fontSize: '0.65rem' }}>
                        BASE: {selectedFacility.base_risk_score}/100
                      </span>
                      {selectedFacility.adjusted_cascading_score !== undefined && (
                        <span className="badge badge-medium" style={{ fontSize: '0.65rem' }}>
                          CASCADE: {selectedFacility.adjusted_cascading_score}
                        </span>
                      )}
                    </div>
                  </div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginTop: '6px' }}>
                    {selectedFacility.facility_name}
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {selectedFacility.lga_name} LGA, {selectedFacility.state} State • {selectedFacility.facility_type}
                  </p>
                </div>

                {/* Diagnostic Reasons */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    TRIAGE REASONING BREAKDOWN
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {selectedFacility.detailed_reasons?.map((reason, idx) => (
                      <div key={idx} style={{
                        fontSize: '0.75rem',
                        padding: '6px 8px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '6px',
                        borderLeft: '3px solid var(--risk-high)',
                        color: 'var(--text-primary)'
                      }}>
                        {reason}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Operational Capacity Specs */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    OPERATIONAL CAPACITY
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={11} color="#06b6d4" /> Staffing Roster
                      </div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, marginTop: '2px' }}>
                        {selectedFacility.total_staff} Total ({selectedFacility.nurses_midwives_count} Nurses)
                      </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Sun size={11} color="#f59e0b" /> Cold Chain Status
                      </div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, marginTop: '2px', color: selectedFacility.has_cold_chain ? 'var(--emerald-400)' : 'var(--risk-high)' }}>
                        {selectedFacility.has_cold_chain ? 'Solar Refrigerator' : 'No Cold Chain'}
                      </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <HeartPulse size={11} color="#ec4899" /> Catchment Pop.
                      </div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, marginTop: '2px' }}>
                        {selectedFacility.catchment_population?.toLocaleString()} people
                      </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Signal size={11} color="#3b82f6" /> GSM Connectivity
                      </div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, marginTop: '2px' }}>
                        {Math.round(selectedFacility.gsm_connectivity_score * 100)}% coverage
                      </div>
                    </div>
                  </div>
                </div>

                {/* 10 Essential Commodities */}
                {selectedFacility.commodities && selectedFacility.commodities.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Package size={13} color="#06b6d4" />
                      ESSENTIAL COMMODITIES INVENTORY
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      {selectedFacility.commodities.slice(0, 6).map(comm => {
                        const statusBadge = comm.status === 'STOCKOUT' ? 'badge-critical'
                                          : comm.status === 'LOW' ? 'badge-medium' : 'badge-low';
                        return (
                          <div key={comm.commodity_id} style={{
                            padding: '6px 8px',
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{comm.name}</span>
                              <span className={`badge ${statusBadge}`} style={{ fontSize: '0.58rem', padding: '1px 4px' }}>
                                {comm.status}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {comm.estimated_days_remaining > 0 ? `~${comm.estimated_days_remaining}d supply` : 'Stockout Alert'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Multi-Hop Cascading Spillover Simulation */}
                <div style={{
                  background: 'rgba(6, 182, 212, 0.05)',
                  border: '1px solid rgba(6, 182, 212, 0.25)',
                  borderRadius: '8px',
                  padding: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <Share2 size={14} color="var(--accent-cyan)" />
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                      Cascading Simulation
                    </h4>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                    Simulate how a stockout shock wave ripples through neighboring clinics.
                  </p>

                  <button
                    onClick={() => handleSimulateCascading(selectedFacility.facility_id)}
                    disabled={simulating}
                    style={{
                      width: '100%',
                      padding: '8px',
                      background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Zap size={14} />
                    {simulating ? 'Calculating Cascade...' : 'Simulate Shock (+35 pts)'}
                  </button>

                  {cascadingResult && (
                    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
                        Hop 1: Direct Neighbors Impact
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {cascadingResult.direct_hop1_neighbors?.map(n => (
                          <div key={n.facility_id} style={{
                            fontSize: '0.72rem',
                            padding: '6px 8px',
                            background: n.jumped_to_critical ? 'rgba(220, 38, 38, 0.2)' : 'rgba(239, 68, 68, 0.08)',
                            border: `1px solid ${n.jumped_to_critical ? 'rgba(220, 38, 38, 0.5)' : 'rgba(239, 68, 68, 0.2)'}`,
                            borderRadius: '6px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <div>
                              <div style={{ fontWeight: 600 }}>{n.facility_name} ({n.distance_km} km)</div>
                              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                                Base: {n.original_risk} ➔ New: {n.new_risk}
                              </div>
                            </div>
                            <span style={{ color: 'var(--risk-high)', fontWeight: 700 }}>
                              +{n.added_risk} pts
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Select a facility on the left or on the map to inspect its dossier.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
