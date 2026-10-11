import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Activity, 
  Building2, 
  Search, 
  Zap, 
  RefreshCw,
  Share2,
  Package,
  Users,
  ChevronLeft,
  ChevronRight,
  Shield,
  MapPin,
  Thermometer,
  ArrowUpRight,
  BarChart3,
  Map as MapIcon,
  TrendingUp,
  AlertTriangle,
  Radio,
  Clock,
  Layers
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend,
  CartesianGrid, 
  ReferenceLine, 
  Cell 
} from 'recharts';
import { 
  fetchOverviewStats, 
  fetchFacilities, 
  fetchFacilityById, 
  simulateCascadingRisk,
  fetchDatasetAnalytics 
} from './services/api.ts';
import { 
  Facility, 
  OverviewStats, 
  CascadingSimulationResponse, 
  NeighborDetail,
  DatasetAnalyticsResponse 
} from './types/index.ts';
import FacilityMap from './components/FacilityMap.tsx';

interface AuthUser {
  username: string;
  role: 'NATIONAL' | 'STATE';
  state: string;
  displayName: string;
}

const DEMO_PRESET_USERS: AuthUser[] = [
  { username: 'National_Admin', role: 'NATIONAL', state: '', displayName: 'Federal Ministry of Health (All States)' },
  { username: 'Lagos_Admin', role: 'STATE', state: 'Lagos', displayName: 'Lagos State Primary Health Care Board' },
  { username: 'Sokoto_Admin', role: 'STATE', state: 'Sokoto', displayName: 'Sokoto State Primary Health Care Agency' },
  { username: 'Yobe_Admin', role: 'STATE', state: 'Yobe', displayName: 'Yobe State Primary Health Care Board' },
  { username: 'Bayelsa_Admin', role: 'STATE', state: 'Bayelsa', displayName: 'Bayelsa State Primary Health Care Board' },
  { username: 'Plateau_Admin', role: 'STATE', state: 'Plateau', displayName: 'Plateau State Primary Health Care Board' },
  { username: 'Ebonyi_Admin', role: 'STATE', state: 'Ebonyi', displayName: 'Ebonyi State Primary Health Care Agency' },
  { username: 'Anambra_Admin', role: 'STATE', state: 'Anambra', displayName: 'Anambra State Primary Health Care Agency' },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser>(DEMO_PRESET_USERS[0]);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [customLoginInput, setCustomLoginInput] = useState<string>('');

  // View Mode: 'map' or 'analytics'
  const [mainViewMode, setMainViewMode] = useState<'map' | 'analytics'>('map');
  const [analyticsSubTab, setAnalyticsSubTab] = useState<'commodities' | 'lgas' | 'reporting' | 'states' | 'facilities'>('commodities');
  const [datasetAnalytics, setDatasetAnalytics] = useState<DatasetAnalyticsResponse | null>(null);

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

  // Active Tab in Dossier
  const [activeTab, setActiveTab] = useState<'network' | 'inventory' | 'simulator'>('network');

  // Pagination for Triage List (5 per page)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 5;

  useEffect(() => {
    if (currentUser.role === 'STATE') {
      setSelectedState(currentUser.state);
    }
  }, [currentUser]);

  useEffect(() => {
    loadData();
    setCurrentPage(1);
  }, [selectedState, selectedTier, onlySilent, currentUser]);

  useEffect(() => {
    if (selectedFacility) {
      fetchFacilityById(selectedFacility.facility_id)
        .then(res => setNeighbors(res.network?.neighbors || []))
        .catch(() => setNeighbors([]));
    } else {
      setNeighbors([]);
    }
  }, [selectedFacility?.facility_id]);

  async function loadData() {
    setLoading(true);
    const activeState = currentUser.role === 'STATE' ? currentUser.state : selectedState;

    try {
      const [statsData, facData, analyticsData] = await Promise.all([
        fetchOverviewStats(activeState ? { state: activeState } : undefined).catch(() => null),
        fetchFacilities({ 
          state: activeState || undefined,
          risk_tier: selectedTier || undefined,
          is_silent: onlySilent ? true : undefined,
          limit: 1500
        }).catch(() => ({ facilities: [], total_count: 0, page: 1, limit: 50, total_pages: 1, filter_summary: { critical_risk: 0, high_risk: 0, medium_risk: 0, low_risk: 0, silent_facilities: 0 } })),
        fetchDatasetAnalytics(activeState || undefined).catch(() => null)
      ]);
      setStats(statsData);
      setDatasetAnalytics(analyticsData);
      const list = facData.facilities || [];
      setFacilities(list);

      if (list.length > 0) {
        if (!selectedFacility || !list.some(f => f.facility_id === selectedFacility.facility_id)) {
          setSelectedFacility(list[0]);
        }
      } else {
        setSelectedFacility(null);
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleSelectFacility = useCallback((fac: Facility) => {
    setSelectedFacility(fac);
    setCascadingResult(null);
  }, []);

  const handleSelectNeighbor = useCallback((neighborId: string) => {
    const target = facilities.find(f => f.facility_id === neighborId);
    if (target) {
      handleSelectFacility(target);
    } else {
      fetchFacilityById(neighborId).then(res => {
        if (res.facility) {
          handleSelectFacility(res.facility);
        }
      });
    }
  }, [facilities, handleSelectFacility]);

  async function handleSimulateCascading(facId: string) {
    setSimulating(true);
    try {
      const res = await simulateCascadingRisk(facId, 35);
      setCascadingResult(res);
      setActiveTab('simulator');
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setSimulating(false);
    }
  }

  function handleLogin(usernameToLogin: string) {
    const trimmed = usernameToLogin.trim();
    if (!trimmed) return;

    const matchedState = ['Lagos', 'Sokoto', 'Yobe', 'Bayelsa', 'Plateau', 'Ebonyi', 'Anambra'].find(
      s => trimmed.toLowerCase().startsWith(s.toLowerCase())
    );

    if (matchedState) {
      setCurrentUser({
        username: trimmed,
        role: 'STATE',
        state: matchedState,
        displayName: `${matchedState} State Primary Health Care Board`
      });
      setSelectedState(matchedState);
    } else {
      setCurrentUser({
        username: trimmed,
        role: 'NATIONAL',
        state: '',
        displayName: 'Federal Ministry of Health (All States)'
      });
      setSelectedState('');
    }
    setShowAuthModal(false);
    setCustomLoginInput('');
  }

  const filteredFacilities = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return facilities;
    return facilities.filter(f => 
      f.facility_name?.toLowerCase().includes(q) ||
      f.lga_name?.toLowerCase().includes(q) ||
      f.state?.toLowerCase().includes(q) ||
      (f.nhfr_facility_code && f.nhfr_facility_code.toLowerCase().includes(q))
    );
  }, [facilities, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredFacilities.length / itemsPerPage));
  const paginatedFacilities = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredFacilities.slice(start, start + itemsPerPage);
  }, [filteredFacilities, currentPage, itemsPerPage]);

  const coldChainReadyCount = useMemo(() => facilities.filter(f => f.has_cold_chain).length, [facilities]);
  const coldChainPct = useMemo(() => facilities.length > 0 ? Math.round((coldChainReadyCount / facilities.length) * 100) : 0, [facilities, coldChainReadyCount]);

  // Recharts Dataset 1: Risk Tier Breakdown
  const riskTierChartData = useMemo(() => {
    const crit = facilities.filter(f => f.risk_tier === 'CRITICAL').length;
    const high = facilities.filter(f => f.risk_tier === 'HIGH').length;
    const med = facilities.filter(f => f.risk_tier === 'MEDIUM').length;
    const low = facilities.filter(f => f.risk_tier === 'LOW').length;
    const silent = facilities.filter(f => f.is_silent).length;

    return [
      { name: 'Critical (70-100)', count: crit, color: '#DC2626' },
      { name: 'High (45-69)', count: high, color: '#EA580C' },
      { name: 'Medium (25-44)', count: med, color: '#D97706' },
      { name: 'Low (0-24)', count: low, color: '#16A34A' },
      { name: 'Silent Blackout', count: silent, color: '#0052FF' },
    ];
  }, [facilities]);

  // Recharts Dataset 2: LGA Average Risk Comparison (Actual Dataset Aggregation)
  const lgaChartData = useMemo(() => {
    const lgaMap: Record<string, { lga_name: string; state: string; count: number; total_risk: number; stockouts: number }> = {};
    facilities.forEach(f => {
      const key = `${f.lga_name}`;
      if (!lgaMap[key]) {
        lgaMap[key] = { lga_name: f.lga_name, state: f.state, count: 0, total_risk: 0, stockouts: 0 };
      }
      lgaMap[key].count += 1;
      lgaMap[key].total_risk += f.base_risk_score || 0;
      if (f.ground_truth_stockout_count && f.ground_truth_stockout_count > 0) {
        lgaMap[key].stockouts += 1;
      }
    });

    return Object.values(lgaMap)
      .map(item => ({
        lga: `${item.lga_name}`,
        avgRisk: Math.round(item.total_risk / item.count),
        clinicCount: item.count,
        stockoutRate: Math.round((item.stockouts / item.count) * 100)
      }))
      .sort((a, b) => b.avgRisk - a.avgRisk)
      .slice(0, 10);
  }, [facilities]);

  // Recharts Dataset: Facility Staffing Comparison by Type
  const facilityTypeStaffData = useMemo(() => {
    const typeMap: Record<string, { totalStaff: number; totalNurses: number; count: number }> = {};
    facilities.forEach(f => {
      const type = f.facility_type || 'PHC';
      if (!typeMap[type]) {
        typeMap[type] = { totalStaff: 0, totalNurses: 0, count: 0 };
      }
      typeMap[type].totalStaff += f.total_staff || 0;
      typeMap[type].totalNurses += f.nurses_midwives_count || 0;
      typeMap[type].count += 1;
    });

    return Object.entries(typeMap).map(([type, d]) => ({
      type: type.replace('Comprehensive Health Centre', 'CHC').replace('Primary Health Centre', 'PHC').replace('Primary Health Clinic', 'Clinic'),
      avgStaff: Math.round((d.totalStaff / d.count) * 10) / 10,
      avgNurses: Math.round((d.totalNurses / d.count) * 10) / 10,
      count: d.count
    }));
  }, [facilities]);

  return (
    <div className="app-container">
      {/* Header */}
      <header style={{
        background: '#FFFFFF',
        borderBottom: '1px solid var(--border-light)',
        padding: '12px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '6px',
            background: 'var(--blue-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Activity size={18} color="#FFFFFF" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Repulse
              </span>
              <span className="badge-clean badge-blue">
                Risk Engine
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Nigeria Primary Healthcare Vulnerability Triage & Spatial Spillover
            </div>
          </div>
        </div>

        {/* View Switcher & User Account */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Main View Toggle Buttons */}
          <div style={{ display: 'flex', background: '#F1F5F9', padding: '3px', borderRadius: '6px' }}>
            <button
              onClick={() => setMainViewMode('map')}
              className={`btn ${mainViewMode === 'map' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '5px 12px', fontSize: '12px', border: 'none' }}
            >
              <MapIcon size={14} />
              Live Map & Triage
            </button>
            <button
              onClick={() => setMainViewMode('analytics')}
              className={`btn ${mainViewMode === 'analytics' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '5px 12px', fontSize: '12px', border: 'none' }}
            >
              <BarChart3 size={14} />
              Visual Analytics (Recharts)
            </button>
          </div>

          <button
            onClick={() => setShowAuthModal(true)}
            className="btn btn-outline"
            style={{ padding: '6px 12px', fontSize: '12px' }}
          >
            <Shield size={14} color="var(--blue-primary)" />
            <span>
              {currentUser.role === 'STATE' ? `${currentUser.state} State Officer` : 'National Admin'}
            </span>
            <span style={{ color: 'var(--text-subtle)', marginLeft: '4px' }}>({currentUser.username})</span>
          </button>

          <button 
            onClick={loadData}
            className="btn btn-outline"
            style={{ padding: '6px 12px', fontSize: '12px' }}
            title="Refresh database records"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Sync
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main style={{ padding: '18px 28px', maxWidth: '1750px', margin: '0 auto', width: '100%', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
        
        {/* KPI Overview Row */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '14px'
        }}>
          <div className="panel" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Monitored Facilities
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
              {stats?.total_facilities ?? facilities.length ?? 0}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {currentUser.role === 'STATE' ? `${currentUser.state} State Scope` : '24 Priority LGAs across Nigeria'}
            </div>
          </div>

          <div className="panel" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Critical & High Triage
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#DC2626', marginTop: '4px' }}>
              {stats ? (stats.critical_risk_count + stats.high_risk_count) : 0}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {stats?.critical_risk_count || 0} Critical Priority • {stats?.high_risk_count || 0} High Risk
            </div>
          </div>

          <div className="panel" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Reporting Blackouts
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>
              {stats?.silent_facilities_count ?? facilities.filter(f => f.is_silent).length ?? 0}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Clinics with ≥3 consecutive missed reports
            </div>
          </div>

          <div className="panel" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Cold Chain Readiness
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
              {coldChainPct}%
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '6px' }}>
                ({coldChainReadyCount} clinics)
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Solar direct-drive vaccine preservation
            </div>
          </div>
        </section>

        {/* Filter Controls Bar */}
        <div style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          background: '#FFFFFF',
          padding: '10px 16px',
          borderRadius: '8px',
          border: '1px solid var(--border-light)',
        }}>
          <div style={{ position: 'relative', flex: '1 1 280px' }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              placeholder="Search facility name, LGA, ward, NHFR..." 
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="input-clean"
              style={{ width: '100%', paddingLeft: '34px' }}
            />
          </div>

          <select 
            value={currentUser.role === 'STATE' ? currentUser.state : selectedState} 
            onChange={e => { setSelectedState(e.target.value); setCurrentPage(1); }}
            disabled={currentUser.role === 'STATE'}
            className="input-clean"
            style={{ cursor: currentUser.role === 'STATE' ? 'not-allowed' : 'pointer' }}
          >
            {currentUser.role === 'STATE' ? (
              <option value={currentUser.state}>State: {currentUser.state} (Locked)</option>
            ) : (
              <>
                <option value="">All States (6 Zones)</option>
                <option value="Sokoto">Sokoto</option>
                <option value="Yobe">Yobe</option>
                <option value="Ebonyi">Ebonyi</option>
                <option value="Plateau">Plateau</option>
                <option value="Bayelsa">Bayelsa</option>
                <option value="Lagos">Lagos</option>
                <option value="Anambra">Anambra</option>
              </>
            )}
          </select>

          <select 
            value={selectedTier} 
            onChange={e => { setSelectedTier(e.target.value); setCurrentPage(1); }}
            className="input-clean"
            style={{ cursor: 'pointer' }}
          >
            <option value="">All Risk Tiers</option>
            <option value="CRITICAL">Critical (70–100)</option>
            <option value="HIGH">High (45–69)</option>
            <option value="MEDIUM">Medium (25–44)</option>
            <option value="LOW">Low (0–24)</option>
          </select>

          <button
            onClick={() => { setOnlySilent(!onlySilent); setCurrentPage(1); }}
            className={onlySilent ? 'btn btn-primary' : 'btn btn-outline'}
            style={{ fontSize: '12px' }}
          >
            {onlySilent ? 'Showing Silent Only' : 'Filter Silent'}
          </button>
        </div>

        {/* VIEW 1: MAP & TRIAGE QUEUE */}
        {mainViewMode === 'map' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '320px 1fr 440px',
            gap: '14px',
            height: '660px',
            minHeight: '660px'
          }}>
            
            {/* Column 1: Triage List (5 items per page) */}
            <div className="panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Triage Queue
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                    ({filteredFacilities.length})
                  </span>
                </div>

                {/* Compact Arrow Pagination */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="btn btn-outline"
                    style={{ padding: '3px 7px' }}
                    title="Previous"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', padding: '0 4px' }}>
                    {currentPage}/{totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="btn btn-outline"
                    style={{ padding: '3px 7px' }}
                    title="Next"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>

              {/* List items (5 per page) */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
                {paginatedFacilities.length > 0 ? (
                  paginatedFacilities.map(fac => {
                    const isSelected = selectedFacility?.facility_id === fac.facility_id;
                    const dotColor = fac.risk_tier === 'CRITICAL' ? '#DC2626' 
                                  : fac.risk_tier === 'HIGH' ? '#EA580C' 
                                  : fac.risk_tier === 'MEDIUM' ? '#D97706' : '#16A34A';

                    return (
                      <div 
                        key={fac.facility_id}
                        onClick={() => handleSelectFacility(fac)}
                        className={`panel-row ${isSelected ? 'panel-row-selected' : ''}`}
                        style={{
                          padding: '12px 14px',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, paddingRight: '8px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13.5px', color: isSelected ? 'var(--blue-primary)' : 'var(--text-primary)', lineHeight: '1.25' }}>
                              {fac.facility_name}
                            </div>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {fac.lga_name} LGA, {fac.state}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: dotColor }} />
                            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)' }}>
                              {fac.base_risk_score}
                            </span>
                          </div>
                        </div>

                        <div style={{ marginTop: '5px', fontSize: '11.5px', color: 'var(--text-body)', lineHeight: '1.35' }}>
                          {fac.top_reason_summary?.split('•')[0] || 'Standard baseline parameters'}
                        </div>

                        {fac.is_silent && (
                          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#D97706', fontWeight: 600 }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#D97706' }} />
                            Silent ({fac.weeks_since_last_report || 3} wks missed)
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                    No facilities found.
                  </div>
                )}
              </div>

              {/* List Footer */}
              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '10px', marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredFacilities.length)} of {filteredFacilities.length}
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="btn btn-outline"
                    style={{ padding: '3px 8px', fontSize: '11px' }}
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="btn btn-outline"
                    style={{ padding: '3px 8px', fontSize: '11px' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

            {/* Column 2: Geospatial Map */}
            <div style={{ height: '100%' }}>
              <FacilityMap
                facilities={filteredFacilities}
                selectedFacility={selectedFacility}
                neighbors={neighbors}
                cascadingResult={cascadingResult}
                onSelectFacility={handleSelectFacility}
              />
            </div>

            {/* Column 3: Tabbed Facility Dossier */}
            <div className="panel" style={{ padding: '18px', overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {selectedFacility ? (
                <>
                  {/* Header Profile */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--blue-primary)', fontWeight: 700 }}>
                        NHFR: {selectedFacility.nhfr_facility_code || selectedFacility.facility_id}
                      </span>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <span className="badge-clean badge-blue">
                          Risk Score: {selectedFacility.base_risk_score}
                        </span>
                        <span className="badge-clean">
                          {selectedFacility.risk_tier}
                        </span>
                      </div>
                    </div>

                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px', lineHeight: '1.2' }}>
                      {selectedFacility.facility_name}
                    </h3>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {selectedFacility.lga_name} LGA, {selectedFacility.state} • {selectedFacility.facility_type}
                    </div>
                  </div>

                  {/* Clean Navigation Tabs */}
                  <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', gap: '6px' }}>
                    <button
                      onClick={() => setActiveTab('network')}
                      className={`tab-btn ${activeTab === 'network' ? 'tab-btn-active' : ''}`}
                    >
                      Spatial & Triage
                    </button>
                    <button
                      onClick={() => setActiveTab('inventory')}
                      className={`tab-btn ${activeTab === 'inventory' ? 'tab-btn-active' : ''}`}
                    >
                      Commodities ({selectedFacility.commodities?.length || 0})
                    </button>
                    <button
                      onClick={() => setActiveTab('simulator')}
                      className={`tab-btn ${activeTab === 'simulator' ? 'tab-btn-active' : ''}`}
                    >
                      Cascade Simulator
                    </button>
                  </div>

                  {/* TAB 1: SPATIAL NETWORK & TRIAGE OVERVIEW */}
                  {activeTab === 'network' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Nearest Neighbors */}
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                          Nearest Neighboring Clinics ({neighbors.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {neighbors && neighbors.length > 0 ? (
                            neighbors.map(neighbor => (
                              <div 
                                key={neighbor.facility_id}
                                onClick={() => handleSelectNeighbor(neighbor.facility_id)}
                                className="panel-row"
                                style={{
                                  padding: '9px 12px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}
                                title="Click to inspect this neighboring facility"
                              >
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-primary)' }}>
                                    {neighbor.facility_name}
                                  </div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    {neighbor.distance_km} km away • Staff: {neighbor.total_staff} • Cold Chain: {neighbor.has_cold_chain ? 'Yes' : 'No'}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span className="badge-clean">
                                    {neighbor.neighbor_base_risk}
                                  </span>
                                  <ArrowUpRight size={13} color="var(--blue-primary)" />
                                </div>
                              </div>
                            ))
                          ) : (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              Loading spatial network neighbors...
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Diagnostic Drivers */}
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                          Diagnostic Drivers
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {selectedFacility.detailed_reasons?.map((reason, idx) => (
                            <div key={idx} style={{
                              fontSize: '12px',
                              padding: '7px 10px',
                              background: '#F8FAFC',
                              border: '1px solid var(--border-light)',
                              borderRadius: '6px',
                              color: 'var(--text-body)',
                              lineHeight: '1.35'
                            }}>
                              {reason}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Clinical Readiness Grid */}
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                          Clinical Readiness
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                          <div style={{ background: '#F8FAFC', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Staffing</div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                              {selectedFacility.total_staff} Staff ({selectedFacility.nurses_midwives_count} Nurses)
                            </div>
                          </div>

                          <div style={{ background: '#F8FAFC', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Cold Chain</div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                              {selectedFacility.has_cold_chain ? 'Solar Refrigerator' : 'No Cold Chain'}
                            </div>
                          </div>

                          <div style={{ background: '#F8FAFC', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Catchment Pop.</div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                              {selectedFacility.catchment_population?.toLocaleString()}
                            </div>
                          </div>

                          <div style={{ background: '#F8FAFC', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>GSM Connectivity</div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                              {Math.round(selectedFacility.gsm_connectivity_score * 100)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: ESSENTIAL COMMODITIES INVENTORY */}
                  {activeTab === 'inventory' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Essential Commodities Stock ({selectedFacility.commodities?.length || 0})
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Week 52 Inventory Status
                        </div>
                      </div>

                      {/* Clean Commodities List */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {selectedFacility.commodities?.map(comm => {
                          const badgeClass = comm.status === 'ADEQUATE' ? 'badge-clean badge-green'
                                          : comm.status === 'STOCKOUT' ? 'badge-clean badge-red'
                                          : 'badge-clean badge-amber';

                          return (
                            <div key={comm.commodity_id} style={{
                              padding: '10px 12px',
                              background: '#F8FAFC',
                              border: '1px solid var(--border-light)',
                              borderRadius: '6px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}>
                              <div>
                                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                  {comm.name}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  {comm.category} • {comm.unit}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                                <span className={badgeClass}>
                                  {comm.status}
                                </span>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: comm.status === 'STOCKOUT' ? '#DC2626' : comm.status === 'LOW' ? '#D97706' : '#16A34A' }}>
                                  {comm.estimated_days_remaining}d supply
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: CASCADING STOCKOUT SIMULATOR */}
                  {activeTab === 'simulator' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                          Simulate Patient Spillover
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Simulates a stockout shock wave spreading across the {neighbors.length} nearest clinics.
                        </p>
                      </div>

                      <button
                        onClick={() => handleSimulateCascading(selectedFacility.facility_id)}
                        disabled={simulating}
                        className="btn btn-primary"
                        style={{ width: '100%', justifyContent: 'center', padding: '9px' }}
                      >
                        <Zap size={14} />
                        {simulating ? 'Simulating Spillover...' : 'Trigger Stockout Shock (+35 pts)'}
                      </button>

                      {cascadingResult && (
                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                            Neighboring Clinics Impacted ({cascadingResult.direct_hop1_neighbors?.length || 0})
                          </div>
                          {cascadingResult.direct_hop1_neighbors?.map(n => (
                            <div key={n.facility_id} style={{
                              fontSize: '12px',
                              padding: '8px 10px',
                              background: '#F8FAFC',
                              border: '1px solid var(--border-light)',
                              borderRadius: '6px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}>
                              <div>
                                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{n.facility_name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{n.distance_km} km away</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <span className="badge-clean badge-blue">
                                  +{n.added_risk} pts
                                </span>
                                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  Risk: {n.original_risk} ➔ {n.new_risk}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Select a facility from the triage queue or map.
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: VISUAL ANALYTICS (RECHARTS BAR CHARTS POWERED DIRECTLY BY THE DATASET) */}
        {mainViewMode === 'analytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Analytics Sub-Navigation Bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#FFFFFF',
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
            }}>
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
                <button
                  onClick={() => setAnalyticsSubTab('commodities')}
                  className={`tab-btn ${analyticsSubTab === 'commodities' ? 'tab-btn-active' : ''}`}
                >
                  <Package size={13} />
                  Essential Commodities Stockout ({datasetAnalytics?.commodity_stockouts.length || 8})
                </button>
                <button
                  onClick={() => setAnalyticsSubTab('lgas')}
                  className={`tab-btn ${analyticsSubTab === 'lgas' ? 'tab-btn-active' : ''}`}
                >
                  <MapPin size={13} />
                  LGA Vulnerability Index ({datasetAnalytics?.lga_vulnerability.length || 0} LGAs)
                </button>
                <button
                  onClick={() => setAnalyticsSubTab('reporting')}
                  className={`tab-btn ${analyticsSubTab === 'reporting' ? 'tab-btn-active' : ''}`}
                >
                  <Radio size={13} />
                  Reporting Latency & Blackouts
                </button>
                <button
                  onClick={() => setAnalyticsSubTab('states')}
                  className={`tab-btn ${analyticsSubTab === 'states' ? 'tab-btn-active' : ''}`}
                >
                  <TrendingUp size={13} />
                  State & Zone Comparisons
                </button>
                <button
                  onClick={() => setAnalyticsSubTab('facilities')}
                  className={`tab-btn ${analyticsSubTab === 'facilities' ? 'tab-btn-active' : ''}`}
                >
                  <Building2 size={13} />
                  Staffing & Infrastructure
                </button>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge-clean badge-blue">
                  Dataset Source: {datasetAnalytics?.total_facilities ?? facilities.length} Monitored Facilities
                </span>
              </div>
            </div>

            {/* TAB 1: ESSENTIAL COMMODITIES STOCKOUT BAR CHARTS */}
            {analyticsSubTab === 'commodities' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                {/* Main Stockout Rate % Bar Chart */}
                <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Essential Commodity Stockout Rates (% of Facilities)
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Computed across all {datasetAnalytics?.total_facilities || facilities.length} healthcare facilities in scope
                    </div>
                  </div>

                  <div style={{ height: '360px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.commodity_stockouts || []} 
                        layout="vertical"
                        margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} vertical={true} />
                        <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#64748B' }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#334155' }} width={160} />
                        <Tooltip 
                          formatter={(val: any, name: any, item: any) => [
                            `${val}% stockout rate (${item.payload.stockout_facilities} of ${item.payload.total_facilities} facilities)`,
                            item.payload.name
                          ]}
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '12px' }}
                        />
                        <ReferenceLine x={50} stroke="#DC2626" strokeDasharray="3 3" label={{ value: 'Severe Shortage (50%)', fill: '#DC2626', fontSize: 10 }} />
                        <Bar dataKey="stockout_rate_pct" name="Stockout Rate %" radius={[0, 4, 4, 0]}>
                          {(datasetAnalytics?.commodity_stockouts || []).map((entry, idx) => (
                            <Cell key={`cell-comm-${idx}`} fill={entry.stockout_rate_pct >= 50 ? '#DC2626' : entry.stockout_rate_pct >= 25 ? '#EA580C' : '#0052FF'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
                    * Measles and Oxytocin display highest stockout frequency due to cold-chain dependency.
                  </div>
                </div>

                {/* Secondary Unmet Demand Units Bar Chart */}
                <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Unmet Patient Demand (Estimated Doses / Packs)
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Aggregated shortfall volume from stockout intervals in active dataset
                    </div>
                  </div>

                  <div style={{ height: '360px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.commodity_stockouts || []} 
                        margin={{ top: 10, right: 20, left: 10, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} interval={0} angle={-35} textAnchor="end" />
                        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                        <Tooltip 
                          formatter={(val: any) => [`${Number(val).toLocaleString()} units`, 'Total Unmet Demand']}
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '12px' }}
                        />
                        <Bar dataKey="total_unmet_demand" fill="#0052FF" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
                    * Units represent unfulfilled prescriptions during stockout episodes.
                  </div>
                </div>

                {/* Full Commodities Data Table */}
                <div className="panel" style={{ gridColumn: 'span 2', padding: '20px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
                    Essential Commodities Inventory Summary Table
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '8px' }}>Commodity Name</th>
                          <th style={{ padding: '8px' }}>Category</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Stockout Clinics</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Stockout Rate</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Avg Days Stocked Out</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Unmet Demand</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Cold Chain Breaches</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datasetAnalytics?.commodity_stockouts.map(comm => (
                          <tr key={comm.commodity_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '10px 8px', fontWeight: 700, color: 'var(--text-primary)' }}>{comm.name}</td>
                            <td style={{ padding: '10px 8px', color: 'var(--text-muted)' }}>{comm.category}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>{comm.stockout_facilities} / {comm.total_facilities}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 800, color: comm.stockout_rate_pct >= 50 ? '#DC2626' : comm.stockout_rate_pct >= 25 ? '#EA580C' : '#16A34A' }}>
                              {comm.stockout_rate_pct}%
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-body)' }}>{comm.avg_days_stocked_out}d</td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--blue-primary)' }}>{comm.total_unmet_demand.toLocaleString()} units</td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', color: comm.cold_chain_breaches > 0 ? '#DC2626' : 'var(--text-muted)' }}>{comm.cold_chain_breaches}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: LGA VULNERABILITY INDEX BAR CHART */}
            {analyticsSubTab === 'lgas' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Chart: LGA Average Risk Score */}
                <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      LGA Mean Vulnerability Risk Score
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Calculated from ground-truth features across {datasetAnalytics?.lga_vulnerability.length || 0} LGAs
                    </div>
                  </div>

                  <div style={{ height: '360px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.lga_vulnerability || []} 
                        margin={{ top: 10, right: 20, left: 0, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="lga_name" tick={{ fontSize: 10, fill: '#64748B' }} interval={0} angle={-35} textAnchor="end" />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} label={{ value: 'Avg Risk', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94A3B8' }} />
                        <Tooltip 
                          formatter={(val: any, name: any, item: any) => [`${val}/100`, `${item.payload.lga_name} (${item.payload.state})`]}
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '12px' }}
                        />
                        <ReferenceLine y={70} stroke="#DC2626" strokeDasharray="3 3" label={{ value: 'Critical (70)', fill: '#DC2626', fontSize: 10 }} />
                        <Bar dataKey="avg_risk_score" name="Avg Risk Score" radius={[4, 4, 0, 0]}>
                          {(datasetAnalytics?.lga_vulnerability || []).map((entry, idx) => (
                            <Cell key={`cell-lga-${idx}`} fill={entry.avg_risk_score >= 70 ? '#DC2626' : entry.avg_risk_score >= 45 ? '#EA580C' : '#0052FF'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Chart: LGA Stockout Rate % vs Immunization Coverage */}
                <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      LGA Stockout Rate % vs Immunization Rate %
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Comparison of facility stockout incidence vs full childhood immunization
                    </div>
                  </div>

                  <div style={{ height: '360px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.lga_vulnerability || []} 
                        margin={{ top: 10, right: 20, left: 0, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="lga_name" tick={{ fontSize: 10, fill: '#64748B' }} interval={0} angle={-35} textAnchor="end" />
                        <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#64748B' }} />
                        <Tooltip 
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '12px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                        <Bar dataKey="stockout_rate_pct" name="Stockout Rate %" fill="#DC2626" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="immunization_rate_pct" name="Immunization Rate %" fill="#0052FF" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: REPORTING LATENCY & SILENCE DISTRIBUTION */}
            {analyticsSubTab === 'reporting' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Facility Distribution by Reporting Latency
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Number of primary health centers by missed weekly report intervals
                    </div>
                  </div>

                  <div style={{ height: '340px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.reporting_latency_distribution || []} 
                        margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#64748B' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} label={{ value: 'Clinics Count', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94A3B8' }} />
                        <Tooltip 
                          formatter={(val: any, name: any, item: any) => [`${val} clinics (${item.payload.percentage}%)`, 'Count']}
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '12px' }}
                        />
                        <Bar dataKey="count" name="Facilities Count" radius={[4, 4, 0, 0]}>
                          {(datasetAnalytics?.reporting_latency_distribution || []).map((entry, idx) => {
                            const color = idx >= 3 ? '#DC2626' : idx >= 2 ? '#EA580C' : idx === 1 ? '#D97706' : '#16A34A';
                            return <Cell key={`cell-rep-${idx}`} fill={color} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Silence Insights Card */}
                <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Information Decay Architecture
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-body)', lineHeight: '1.5' }}>
                    When a clinic misses reports, standard dashboards assume stocks are stable. 
                    The <strong>Repulse Risk Engine</strong> implements time-decay penalty:
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ background: '#F8FAFC', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>Week 1 Missed: Warning Delay</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>+6 risk points applied due to unverified buffer.</div>
                    </div>

                    <div style={{ background: '#F8FAFC', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>Week 2 Missed: Moderate Drift</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>+14 risk points applied with synthetic consumption projection.</div>
                    </div>

                    <div style={{ background: '#F8FAFC', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#DC2626' }}>Week 3+ Missed: Blackout Threshold</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>+24 risk points applied. Immediate escalation to silent triage queue.</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: STATE & ZONE COMPARISONS */}
            {analyticsSubTab === 'states' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      State Average Risk Score Comparison
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Aggregated across all focal states
                    </div>
                  </div>

                  <div style={{ height: '340px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.state_comparison || []} 
                        margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="state" tick={{ fontSize: 11, fill: '#64748B' }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} />
                        <Tooltip 
                          formatter={(val: any, name: any, item: any) => [`${val}/100`, `${item.payload.state} (${item.payload.zone})`]}
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '12px' }}
                        />
                        <Bar dataKey="avg_risk" name="Avg Risk Score" fill="#0052FF" radius={[4, 4, 0, 0]}>
                          {(datasetAnalytics?.state_comparison || []).map((entry, idx) => (
                            <Cell key={`cell-st-${idx}`} fill={entry.avg_risk >= 70 ? '#DC2626' : entry.avg_risk >= 45 ? '#EA580C' : '#0052FF'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Cold Chain Coverage % vs Clinical Staff Density
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Infrastructure readiness by state
                    </div>
                  </div>

                  <div style={{ height: '340px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.state_comparison || []} 
                        margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="state" tick={{ fontSize: 11, fill: '#64748B' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                        <Tooltip 
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '12px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                        <Bar dataKey="cold_chain_pct" name="Cold Chain %" fill="#0052FF" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="avg_staff" name="Avg Staff Density" fill="#64748B" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: FACILITY LEVEL INFRASTRUCTURE & STAFFING */}
            {analyticsSubTab === 'facilities' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Staff Density by Health Facility Level
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Average total staff, nurse-midwives, and CHEWs per facility category
                    </div>
                  </div>

                  <div style={{ height: '340px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.facility_type_breakdown || []} 
                        margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="facility_type" tick={{ fontSize: 11, fill: '#64748B' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                        <Tooltip 
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '12px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                        <Bar dataKey="avg_staff" name="Total Staff" fill="#0052FF" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="avg_nurses" name="Nurses / Midwives" fill="#0284C7" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="avg_chews" name="CHEWs" fill="#64748B" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Infrastructure Electrification & Water (% Equipped)
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Solar power, borehole water, and cold chain distribution
                    </div>
                  </div>

                  <div style={{ height: '340px', width: '100%', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={datasetAnalytics?.facility_type_breakdown || []} 
                        margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="facility_type" tick={{ fontSize: 11, fill: '#64748B' }} />
                        <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#64748B' }} />
                        <Tooltip 
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '12px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                        <Bar dataKey="solar_pct" name="Solar Power %" fill="#0052FF" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="water_pct" name="Borehole Water %" fill="#0284C7" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="cold_chain_pct" name="Cold Chain %" fill="#64748B" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </main>

      {/* State / Role Login Modal */}
      {showAuthModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="panel" style={{ maxWidth: '440px', width: '100%', padding: '22px', boxShadow: '0 10px 25px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '2px' }}>
              Officer Account & State Scope
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Select a state officer demo account or enter your username:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              {DEMO_PRESET_USERS.map(u => (
                <button
                  key={u.username}
                  onClick={() => {
                    setCurrentUser(u);
                    setSelectedState(u.state);
                    setShowAuthModal(false);
                  }}
                  className={`btn ${currentUser.username === u.username ? 'btn-primary' : 'btn-outline'}`}
                  style={{ justifyContent: 'flex-start', fontSize: '12px', padding: '8px 10px' }}
                >
                  {u.username}
                </button>
              ))}
            </div>

            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '14px', display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder="e.g. Lagos_Lead, Sokoto_Officer"
                value={customLoginInput}
                onChange={e => setCustomLoginInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleLogin(customLoginInput); }}
                className="input-clean"
                style={{ flex: 1 }}
              />
              <button onClick={() => handleLogin(customLoginInput)} className="btn btn-primary">
                Login
              </button>
            </div>

            <button
              onClick={() => setShowAuthModal(false)}
              className="btn btn-outline"
              style={{ width: '100%', marginTop: '10px', justifyContent: 'center' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
