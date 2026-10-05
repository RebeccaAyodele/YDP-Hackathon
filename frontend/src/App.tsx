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
  Map as MapIcon,
  LayoutGrid,
  Users,
  Sun,
  Droplets,
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
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

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

  const renderFacilityDossier = (facility: Facility) => (
    <div>
      <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
            NHFR: {facility.nhfr_facility_code || facility.facility_id}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span className={`badge ${facility.risk_tier === 'CRITICAL' ? 'badge-critical' : facility.risk_tier === 'HIGH' ? 'badge-high' : 'badge-low'}`}>
              BASE RISK: {facility.base_risk_score}/100
            </span>
            {facility.adjusted_cascading_score !== undefined && (
              <span className="badge badge-medium">
                CASCADING: {facility.adjusted_cascading_score}/100
              </span>
            )}
          </div>
        </div>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: '6px' }}>
          {facility.facility_name}
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
          {facility.lga_name} LGA, {facility.state} State • {facility.facility_type} ({facility.ownership || 'Public'})
        </p>
      </div>

      {/* Primary Diagnostic Reasoning */}
      <div style={{ marginBottom: '18px' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
          TRIAGE REASONING BREAKDOWN
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {facility.detailed_reasons?.map((reason, idx) => (
            <div key={idx} style={{
              fontSize: '0.8rem',
              padding: '6px 10px',
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

      {/* Operational Capacity & Infrastructure Grid */}
      <div style={{ marginBottom: '18px' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
          FACILITY OPERATIONAL SPECS (DATA LAYER)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Users size={12} color="#06b6d4" /> Staffing Roster
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: '2px' }}>
              {facility.total_staff} Total ({facility.doctors_count} Doctors, {facility.nurses_midwives_count} Nurses, {facility.chew_count} CHEWs)
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sun size={12} color="#f59e0b" /> Cold Chain & Power
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: '2px', color: facility.has_cold_chain ? 'var(--emerald-400)' : 'var(--risk-high)' }}>
              {facility.has_cold_chain ? facility.cold_chain_type || 'Active Solar' : 'No Cold Chain'}
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <HeartPulse size={12} color="#ec4899" /> Catchment Population
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: '2px' }}>
              {facility.catchment_population?.toLocaleString()} people ({facility.is_rural ? 'Rural' : 'Urban'})
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Baby size={12} color="#a855f7" /> Monthly Maternal Targets
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: '2px' }}>
              {facility.monthly_pregnant_target || 12} Pregnant • {facility.monthly_under1_target || 10} Infants
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Signal size={12} color="#3b82f6" /> GSM Connectivity
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: '2px' }}>
              {Math.round(facility.gsm_connectivity_score * 100)}% signal strength
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Truck size={12} color="#eab308" /> Resupply Logistics Difficulty
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: '2px' }}>
              {Math.round(facility.transport_access_difficulty * 100)}% transit friction
            </div>
          </div>
        </div>
      </div>

      {/* Essential Commodities Inventory Grid */}
      {facility.commodities && facility.commodities.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Package size={14} color="#06b6d4" />
            ESSENTIAL COMMODITIES INVENTORY (10 CATALOG ITEMS)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            {facility.commodities.map(comm => {
              const statusBadge = comm.status === 'STOCKOUT' ? 'badge-critical'
                                : comm.status === 'LOW' ? 'badge-medium' : 'badge-low';
              return (
                <div key={comm.commodity_id} style={{
                  padding: '8px 10px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{comm.name}</span>
                    <span className={`badge ${statusBadge}`} style={{ fontSize: '0.62rem' }}>
                      {comm.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {comm.estimated_days_remaining > 0 ? `~${comm.estimated_days_remaining} days supply (${comm.unit})` : '0 doses — Immediate Stockout'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Multi-Hop Cascading Simulation Card */}
      <div style={{
        background: 'rgba(6, 182, 212, 0.05)',
        border: '1px solid rgba(6, 182, 212, 0.25)',
        borderRadius: '10px',
        padding: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <Share2 size={16} color="var(--accent-cyan)" />
          <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
            Multi-Hop Cascading Simulation
          </h4>
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Simulate how a stockout shock ripples through 1st-degree and 2nd-degree neighbor facilities.
        </p>

        <button
          onClick={() => handleSimulateCascading(facility.facility_id)}
          disabled={simulating}
          style={{
            width: '100%',
            padding: '10px',
            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <Zap size={16} />
          {simulating ? 'Calculating Network Cascade...' : 'Simulate Stockout Shock Wave (+35 pts)'}
        </button>

        {cascadingResult && (
          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
              Hop 1: Direct Nearest Neighbors ({cascadingResult.direct_hop1_neighbors?.length || 0})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
              {cascadingResult.direct_hop1_neighbors?.map(n => (
                <div key={n.facility_id} style={{
                  fontSize: '0.78rem',
                  padding: '8px 10px',
                  background: n.jumped_to_critical ? 'rgba(220, 38, 38, 0.2)' : 'rgba(239, 68, 68, 0.08)',
                  border: `1px solid ${n.jumped_to_critical ? 'rgba(220, 38, 38, 0.5)' : 'rgba(239, 68, 68, 0.2)'}`,
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{n.facility_name} ({n.distance_km} km)</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Base: {n.original_risk} ➔ New: {n.new_risk}
                    </div>
                  </div>
                  <span style={{ color: 'var(--risk-high)', fontWeight: 700 }}>
                    +{n.added_risk} pts {n.jumped_to_critical ? '🚨 (CRITICAL)' : ''}
                  </span>
                </div>
              ))}
            </div>

            {cascadingResult.secondary_hop2_neighbors && cascadingResult.secondary_hop2_neighbors.length > 0 && (
              <>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fbbf24', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ArrowRight size={14} />
                  Hop 2: Ripple Domino Effect ({cascadingResult.secondary_hop2_neighbors.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {cascadingResult.secondary_hop2_neighbors.slice(0, 4).map(n => (
                    <div key={n.facility_id} style={{
                      fontSize: '0.75rem',
                      padding: '6px 10px',
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      borderRadius: '6px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{n.facility_name}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          Base: {n.original_risk} ➔ New: {n.new_risk}
                        </div>
                      </div>
                      <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                        +{n.added_risk} pts
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <header style={{
        background: 'rgba(15, 23, 42, 0.95)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '16px 28px',
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
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)'
          }}>
            <Activity size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              PHC Pulse <span className="badge badge-low" style={{ fontSize: '0.65rem' }}>EARLY WARNING</span>
            </h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Primary Healthcare Risk Triage & Cascading Demand Early-Warning
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => setViewMode('map')}
              style={{
                background: viewMode === 'map' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                border: 'none',
                color: viewMode === 'map' ? 'var(--emerald-400)' : 'var(--text-secondary)',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: 600
              }}
            >
              <MapIcon size={14} /> Map View
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{
                background: viewMode === 'list' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                border: 'none',
                color: viewMode === 'list' ? 'var(--emerald-400)' : 'var(--text-secondary)',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: 600
              }}
            >
              <LayoutGrid size={14} /> Triage List
            </button>
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
        </div>
      </header>

      <main style={{ padding: '24px 28px', maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Total Facilities</span>
              <Building2 size={18} color="#06b6d4" />
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{stats?.total_facilities || facilities.length || '—'}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Monitored across {stats?.states_count || 6} focal states
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Critical / High Risk</span>
              <AlertTriangle size={18} color="#ef4444" />
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f87171' }}>
              {stats ? (stats.critical_risk_count + stats.high_risk_count) : '—'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {stats?.critical_risk_count || 0} Critical • {stats?.high_risk_count || 0} High Priority
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Silent Blind Spots</span>
              <Radio size={18} color="#f59e0b" />
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fbbf24' }}>
              {stats?.silent_facilities_count ?? '—'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Clinics missing reports (compounding decay)
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Spatial Network</span>
              <Share2 size={18} color="#8b5cf6" />
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>3,876 Edges</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              k=3 Haversine multi-hop topology
            </div>
          </div>
        </section>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
          alignItems: 'center'
        }}>
          <div style={{ position: 'relative', flex: '1 1 280px' }}>
            <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              placeholder="Search facility name, LGA, ward, NHFR..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px 10px 38px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>

          <select 
            value={selectedState} 
            onChange={e => setSelectedState(e.target.value)}
            style={{
              padding: '10px 14px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '0.9rem',
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
              padding: '10px 14px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '0.9rem',
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
              padding: '10px 16px',
              background: onlySilent ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-secondary)',
              border: `1px solid ${onlySilent ? 'var(--risk-medium)' : 'var(--border-subtle)'}`,
              borderRadius: '8px',
              color: onlySilent ? '#fbbf24' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600
            }}
          >
            {onlySilent ? '⚡ Showing Silent Only' : 'Filter Silent Facilities'}
          </button>
        </div>

        {/* Dynamic View: Map View vs Triage List View */}
        {viewMode === 'map' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px', height: '840px' }}>
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

            <div className="glass-panel" style={{ padding: '24px', overflowY: 'auto' }}>
              {selectedFacility ? renderFacilityDossier(selectedFacility) : (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  Click any marker on the map to inspect its facility dossier.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr',
            gap: '20px'
          }}>
            <div className="glass-panel" style={{ padding: '20px', maxHeight: '840px', overflowY: 'auto' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Triage Ranked Facilities ({filteredFacilities.length})</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ranked by Base Risk</span>
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredFacilities.slice(0, 40).map(fac => {
                  const isSelected = selectedFacility?.facility_id === fac.facility_id;
                  const tierClass = fac.risk_tier === 'CRITICAL' ? 'badge-critical' 
                                  : fac.risk_tier === 'HIGH' ? 'badge-high' 
                                  : fac.risk_tier === 'MEDIUM' ? 'badge-medium' : 'badge-low';
                  return (
                    <div 
                      key={fac.facility_id}
                      onClick={() => { setSelectedFacility(fac); setCascadingResult(null); }}
                      style={{
                        padding: '14px',
                        borderRadius: '8px',
                        background: isSelected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                        border: `1px solid ${isSelected ? 'var(--emerald-500)' : 'var(--border-subtle)'}`,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff' }}>{fac.facility_name}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {fac.lga_name}, {fac.state} • {fac.facility_type}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span className={`badge ${tierClass}`}>
                            {fac.risk_tier} ({fac.base_risk_score})
                          </span>
                          {fac.is_hidden_risk && (
                            <div style={{ fontSize: '0.68rem', color: '#f87171', marginTop: '4px', fontWeight: 700 }}>
                              ⚡ HIDDEN RISK ({fac.adjusted_cascading_score})
                            </div>
                          )}
                          {fac.is_silent && (
                            <div style={{ fontSize: '0.68rem', color: '#fbbf24', marginTop: '2px', fontWeight: 700 }}>
                              ⚠️ SILENT
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ marginTop: '8px', fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        {fac.top_reason_summary}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '24px', maxHeight: '840px', overflowY: 'auto' }}>
              {selectedFacility ? renderFacilityDossier(selectedFacility) : (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  Select a facility on the left to inspect its dossier.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
