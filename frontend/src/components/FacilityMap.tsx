import React, { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet';
import { Facility, NeighborDetail, CascadingSimulationResponse } from '../types/index.ts';

interface MapRecenterProps {
  center: [number, number];
  zoom?: number;
}

function MapRecenter({ center, zoom = 10 }: MapRecenterProps) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 });
  }, [center[0], center[1], zoom, map]);
  return null;
}

interface FacilityMapProps {
  facilities: Facility[];
  selectedFacility: Facility | null;
  neighbors?: NeighborDetail[];
  cascadingResult?: CascadingSimulationResponse | null;
  onSelectFacility: (fac: Facility) => void;
}

export default function FacilityMap({
  facilities,
  selectedFacility,
  neighbors = [],
  cascadingResult,
  onSelectFacility
}: FacilityMapProps) {
  const defaultCenter: [number, number] = selectedFacility
    ? [selectedFacility.latitude, selectedFacility.longitude]
    : [9.0820, 8.6753];

  function getMarkerColor(fac: Facility): string {
    if (fac.is_silent) return '#fbbf24';
    if (fac.risk_tier === 'CRITICAL') return '#ef4444';
    if (fac.risk_tier === 'HIGH') return '#f97316';
    if (fac.risk_tier === 'MEDIUM') return '#f59e0b';
    return '#10b981';
  }

  const networkPolylines = selectedFacility && neighbors.length > 0
    ? neighbors.map(neighbor => {
        const targetFac = facilities.find(f => f.facility_id === neighbor.facility_id);
        if (!targetFac) return null;
        return {
          key: `edge-${selectedFacility.facility_id}-${neighbor.facility_id}`,
          positions: [
            [selectedFacility.latitude, selectedFacility.longitude],
            [targetFac.latitude, targetFac.longitude]
          ] as [number, number][],
          distance: neighbor.distance_km,
          weight: neighbor.overflow_weight,
          targetName: neighbor.facility_name
        };
      }).filter(Boolean)
    : [];

  return (
    <div style={{ height: '100%', minHeight: '440px', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-subtle)', position: 'relative' }}>
      <MapContainer
        center={defaultCenter}
        zoom={selectedFacility ? 10 : 6}
        style={{ height: '100%', width: '100%', background: '#0a0f1d' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {selectedFacility && (
          <MapRecenter
            center={[selectedFacility.latitude, selectedFacility.longitude]}
            zoom={10}
          />
        )}

        {networkPolylines.map(line => (
          line && (
            <Polyline
              key={line.key}
              positions={line.positions}
              pathOptions={{
                color: cascadingResult ? '#ef4444' : '#06b6d4',
                weight: cascadingResult ? 3 : 2,
                dashArray: cascadingResult ? '6, 6' : '3, 6',
                opacity: 0.8
              }}
            />
          )
        ))}

        {facilities.slice(0, 400).map(fac => {
          const isSelected = selectedFacility?.facility_id === fac.facility_id;
          const color = getMarkerColor(fac);
          const radius = isSelected ? 9 : fac.risk_tier === 'CRITICAL' ? 7 : 5;

          return (
            <CircleMarker
              key={fac.facility_id}
              center={[fac.latitude, fac.longitude]}
              radius={radius}
              pathOptions={{
                color: isSelected ? '#ffffff' : color,
                fillColor: color,
                fillOpacity: isSelected ? 1 : 0.75,
                weight: isSelected ? 3 : 1.5
              }}
              eventHandlers={{
                click: () => onSelectFacility(fac)
              }}
            >
              <Popup className="custom-map-popup">
                <div style={{ color: '#0f172a', padding: '4px', minWidth: '180px' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{fac.facility_name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                    {fac.lga_name} LGA, {fac.state}
                  </div>
                  <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                      Risk: {fac.base_risk_score}/100 ({fac.risk_tier})
                    </span>
                    {fac.is_silent && <span style={{ color: '#d97706', fontWeight: 700, fontSize: '0.7rem' }}>SILENT</span>}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '4px' }}>
                    Staff: {fac.total_staff} • Cold Chain: {fac.has_cold_chain ? 'Yes' : 'No'}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div style={{
        position: 'absolute',
        bottom: '16px',
        right: '16px',
        background: 'rgba(15, 23, 42, 0.9)',
        backdropFilter: 'blur(8px)',
        padding: '10px 14px',
        borderRadius: '8px',
        border: '1px solid var(--border-subtle)',
        zIndex: 1000,
        fontSize: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}>
        <div style={{ fontWeight: 700, marginBottom: '2px', color: '#fff' }}>Geospatial Triage Legend</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
          <span>Critical Risk (70-100)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f97316' }} />
          <span>High Risk (50-69)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }} />
          <span>Medium Risk (30-49)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
          <span>Low Risk (0-29)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fbbf24' }} />
          <span>Silent / Non-Reporting</span>
        </div>
      </div>
    </div>
  );
}
