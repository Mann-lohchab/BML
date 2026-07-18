import { useMemo } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { Link } from 'react-router';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { MapPoint } from '@/lib/types';

const INDIA_CENTER: LatLngExpression = [22.7, 79.2];

export function FleetMap({
  points,
  height = 360,
  compact = false
}: {
  points: MapPoint[];
  height?: number;
  compact?: boolean;
}) {
  const validPoints = useMemo(
    () => points.filter((point) =>
      point.gps_lat !== null &&
      point.gps_lon !== null &&
      Number.isFinite(Number(point.gps_lat)) &&
      Number.isFinite(Number(point.gps_lon))
    ),
    [points]
  );
  const center = validPoints.length
    ? [Number(validPoints[0].gps_lat), Number(validPoints[0].gps_lon)] as LatLngExpression
    : INDIA_CENTER;

  return (
    <div className="fleet-map" style={{ height }}>
      <MapContainer center={center} zoom={compact ? 4 : 5} scrollWheelZoom className="fleet-map__canvas">
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {validPoints.map((point) => (
          <CircleMarker
            key={point.id}
            center={[Number(point.gps_lat), Number(point.gps_lon)]}
            radius={compact ? 6 : 8}
            pathOptions={{
              color: point.online ? '#47df92' : '#ff6874',
              fillColor: point.online ? '#16c77c' : '#ef4655',
              fillOpacity: 0.9,
              weight: 2
            }}
          >
            <Popup>
              <div className="map-popup">
                <strong>{point.coach_name}</strong>
                <span>Coach {point.coach_no}</span>
                <span>{point.status ?? 'No status'} · {formatNumber(point.reference_speed)} km/h</span>
                <span>{formatDateTime(point.sample_ts)}</span>
                <Link to={`/coaches/${point.coach_id ?? point.id}`}>Open coach</Link>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      {!validPoints.length && (
        <div className="fleet-map__empty">
          <strong>No GPS fixes yet</strong>
          <span>Coach locations will appear after telemetry arrives.</span>
        </div>
      )}
      <div className="fleet-map__legend">
        <span><i className="dot dot--green" />Online</span>
        <span><i className="dot dot--red" />Offline</span>
      </div>
    </div>
  );
}
