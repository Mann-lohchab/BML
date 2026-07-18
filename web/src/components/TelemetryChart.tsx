import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TelemetrySample } from '@/lib/types';

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function TelemetryChart({ samples }: { samples: TelemetrySample[] }) {
  const data = samples.map((sample) => ({
    time: sample.sample_ts,
    label: timeLabel(sample.sample_ts),
    reference: Number(sample.reference_speed ?? 0),
    axle1: Number(sample.speed_axle_1 ?? 0),
    axle2: Number(sample.speed_axle_2 ?? 0),
    axle3: Number(sample.speed_axle_3 ?? 0),
    axle4: Number(sample.speed_axle_4 ?? 0)
  }));

  return (
    <div className="telemetry-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, left: -14, bottom: 0 }}>
          <CartesianGrid stroke="#ddd7ce" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="label" stroke="#8d8d87" tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis stroke="#8d8d87" tickLine={false} axisLine={false} unit=" km/h" width={74} />
          <Tooltip
            contentStyle={{ background: '#fffdf9', border: '1px solid #d7d0c7', borderRadius: 10 }}
            labelStyle={{ color: '#222522' }}
            itemStyle={{ fontSize: 12 }}
          />
          <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Line type="monotone" dataKey="reference" name="Reference" stroke="#222522" strokeWidth={2.2} dot={false} />
          <Line type="monotone" dataKey="axle1" name="Axle 1" stroke="#12a99c" strokeWidth={1.7} dot={false} />
          <Line type="monotone" dataKey="axle2" name="Axle 2" stroke="#1264d8" strokeWidth={1.7} dot={false} />
          <Line type="monotone" dataKey="axle3" name="Axle 3" stroke="#c88825" strokeWidth={1.7} dot={false} />
          <Line type="monotone" dataKey="axle4" name="Axle 4" stroke="#7b5ac7" strokeWidth={1.7} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
