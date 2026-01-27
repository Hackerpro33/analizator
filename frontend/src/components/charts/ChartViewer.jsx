import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BarChart3, LineChart as LineChartIcon, ScatterChart as ScatterChartIcon, TrendingUp, Box } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, ScatterChart, Scatter, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Chart3D from './Chart3D';

export default function ChartViewer({ visualization, datasets, onClose }) {
    if (!visualization) return null;

    const dataset = datasets.find(d => d.id === visualization.dataset_id);
    const data = dataset?.sample_data || [];

    const getChartIcon = () => {
        const icons = {
          line: LineChartIcon, bar: BarChart3, scatter: ScatterChartIcon,
          area: TrendingUp, '3d': Box
        };
        return icons[visualization.type] || BarChart3;
    };
    const ChartIcon = getChartIcon();

    const renderChart = () => {
        const chartProps = { data: data, margin: { top: 20, right: 30, left: 20, bottom: 20 } };

        switch (visualization.type) {
            case 'line':
                return <LineChart {...chartProps}><CartesianGrid /><XAxis dataKey={visualization.x_axis} /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey={visualization.y_axis} stroke={visualization.config?.color || '#8884d8'} /></LineChart>;
            case 'bar':
                return <BarChart {...chartProps}><CartesianGrid /><XAxis dataKey={visualization.x_axis} /><YAxis /><Tooltip /><Legend /><Bar dataKey={visualization.y_axis} fill={visualization.config?.color || '#82ca9d'} /></BarChart>;
            case 'area':
                return <AreaChart {...chartProps}><CartesianGrid /><XAxis dataKey={visualization.x_axis} /><YAxis /><Tooltip /><Legend /><Area type="monotone" dataKey={visualization.y_axis} stroke={visualization.config?.color} fill={visualization.config?.color} fillOpacity={0.6} /></AreaChart>;
            case 'scatter':
                 return <ScatterChart {...chartProps}><CartesianGrid /><XAxis type="number" dataKey={visualization.x_axis} name={visualization.x_axis} /><YAxis type="number" dataKey={visualization.y_axis} name={visualization.y_axis} /><Tooltip /><Legend /><Scatter name={dataset?.name} data={data} fill={visualization.config?.color || '#8884d8'} /></ScatterChart>;
            case '3d':
                return <Chart3D data={data} config={visualization.config} />;
            default:
                return <div className="text-center p-8">Неподдерживаемый тип графика.</div>;
        }
    };

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl h-4/5 flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ChartIcon className="w-5 h-5 text-blue-500" />
                        {visualization.title}
                    </DialogTitle>
                    <DialogDescription>
                        Просмотр графика: {visualization.x_axis} × {visualization.y_axis} на основе набора данных &quot;{dataset?.name}&quot;
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-grow min-h-0 py-4">
                   <ResponsiveContainer width="100%" height="100%">
                        {renderChart()}
                    </ResponsiveContainer>
                </div>
            </DialogContent>
        </Dialog>
    );
}
