import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  ShieldAlert, 
  Building2, 
  MapPin, 
  Radio, 
  Search, 
  Filter, 
  Zap, 
  RefreshCw,
  CheckCircle2,
  Share2
} from 'lucide-react';
import { fetchOverviewStats, fetchFacilities, simulateCascadingRisk } from './services/api';

export default function App() {
  const [stats, setStats] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [selectedState, setSelectedState] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [cascadingResult, setCascadingResult] = useState(null);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, [selectedState]);

  async function loadInitialData() {
    setLoading(true);
    try {
      const [statsData, facData] = await Promise.all([
        fetchOverviewStats().catch(() => null),
        fetchFacilities({ state: selectedState || undefined }).catch(() => ({ facilities: [] }))
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

  async function handleSimulateCascading(facId) {
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
    const matchesSearch = f.facility_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          f.lga_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="app-container">
      {/* Top Navbar */}
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
              Facility Risk Triage & Cascading Demand Early-Warning for Nigeria
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={loadInitialData}
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
              transition: 'all 0.2s'
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Sync Data
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ padding: '24px 28px', maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
        {/* KPI Summary Cards */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Total Facilities</span>
              <Building2 size={18} color="#06b6d4" />
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{stats?.total_facilities || facilities.length || '—'}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Across {stats?.states_count || 6} Focal Geopolitical States</div>
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Rural Accessibility</span>
              <MapPin size={18} color="#10b981" />
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>
              {stats ? `${Math.round((stats.rural_facilities_count / stats.total_facilities) * 100)}%` : '—'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {stats?.rural_facilities_count || '—'} facilities in rural remote terrain
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Cold Chain Readiness</span>
              <Zap size={18} color="#f59e0b" />
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>
              {stats ? `${Math.round((stats.cold_chain_count / stats.total_facilities) * 100)}%` : '—'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Equipped with active vaccine solar refrigeration
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Network Modeling</span>
              <Share2 size={18} color="#8b5cf6" />
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>k=3 Spatial</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Haversine proximity graph for cascading overflow</div>
          </div>
        </section>

        {/* Search & Filter Toolbar */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
          alignItems: 'center'
        }}>
          <div style={{
            position: 'relative',
            flex: '1 1 300px',
            minWidth: '240px'
          }}>
            <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              placeholder="Search facility name, LGA..." 
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
            <option value="">All States (6 Zones)</option>
            <option value="Lagos">Lagos (South West)</option>
            <option value="Bayelsa">Bayelsa (South South)</option>
            <option value="Plateau">Plateau (North Central)</option>
            <option value="Ebonyi">Ebonyi (South East)</option>
            <option value="Sokoto">Sokoto (North West)</option>
            <option value="Yobe">Yobe (North East)</option>
          </select>
        </div>

        {/* Dashboard Grid: Facility List + Detail & Simulation Panel */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: '20px'
        }}>
          {/* Facility Triage Table */}
          <div className="glass-panel" style={{ padding: '20px', maxHeight: '680px', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Primary Healthcare Facilities ({filteredFacilities.length})
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredFacilities.slice(0, 25).map(fac => {
                const isSelected = selectedFacility?.facility_id === fac.facility_id;
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
                          {fac.lga_name} LGA • {fac.state_name} ({fac.geopolitical_zone})
                        </div>
                      </div>
                      <span className={`badge ${fac.is_rural ? 'badge-medium' : 'badge-low'}`}>
                        {fac.is_rural ? 'RURAL' : 'URBAN'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginTop: '10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      <span>Staff: <strong style={{ color: 'var(--text-primary)' }}>{fac.total_staff}</strong></span>
                      <span>•</span>
                      <span>Type: <strong style={{ color: 'var(--text-primary)' }}>{fac.facility_type}</strong></span>
                      <span>•</span>
                      <span>Cold Chain: <strong style={{ color: fac.has_cold_chain ? 'var(--emerald-400)' : 'var(--risk-high)' }}>{fac.has_cold_chain ? 'YES' : 'NO'}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Facility Deep Dive & Cascading Risk Simulation Card */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            {selectedFacility ? (
              <div>
                <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                      ID: {selectedFacility.facility_id}
                    </span>
                    <span className="badge badge-low">STATUS: ACTIVE</span>
                  </div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '6px' }}>
                    {selectedFacility.facility_name}
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {selectedFacility.lga_name}, {selectedFacility.state_name} State ({selectedFacility.geopolitical_zone})
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Coordinates</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                      {selectedFacility.latitude?.toFixed(4)}, {selectedFacility.longitude?.toFixed(4)}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Staffing Roster</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                      {selectedFacility.nurses_midwives || 0} Nurses, {selectedFacility.chew_staff || 0} CHEWs
                    </div>
                  </div>
                </div>

                {/* Cascading Stress Simulation Section */}
                <div style={{
                  background: 'rgba(6, 182, 212, 0.05)',
                  border: '1px solid rgba(6, 182, 212, 0.25)',
                  borderRadius: '10px',
                  padding: '16px',
                  marginTop: '20px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Share2 size={16} color="var(--accent-cyan)" />
                    <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                      Cascading Risk Simulation
                    </h4>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                    Test what happens when this facility experiences a stockout shock and patients redirect to nearby facilities.
                  </p>

                  <button
                    onClick={() => handleSimulateCascading(selectedFacility.facility_id)}
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
                    {simulating ? 'Simulating Propagation...' : 'Simulate Neighbor Spillover'}
                  </button>

                  {cascadingResult && (
                    <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>
                        Downstream Network Impact:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {cascadingResult.affected_neighbors?.map(n => (
                          <div key={n.facility_id} style={{
                            fontSize: '0.78rem',
                            padding: '8px 10px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            borderRadius: '6px',
                            display: 'flex',
                            justifyContent: 'space-between'
                          }}>
                            <span>{n.facility_name} ({n.distance_km} km)</span>
                            <span style={{ color: 'var(--risk-high)', fontWeight: 700 }}>+{n.propagated_risk_increase} Risk Points</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                Select a facility on the left to view deep-dive details.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
