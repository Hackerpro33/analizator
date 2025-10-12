
import React, { useEffect, useState, useRef } from 'react';
import { Dataset, Visualization } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { X, Sparkles, BrainCircuit, Share2, BarChart3, Map, TrendingUp, Network, Database } from 'lucide-react';
import { summarizeProjectStructure } from "@/utils/localAnalysis";

export default function GlobalForceGraph({ onClose }) {
    const [nodes, setNodes] = useState([]);
    const [links, setLinks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [aiInsights, setAiInsights] = useState(null);
    const [isAiLoading, setIsAiLoading] = useState(true);
    const svgRef = useRef();

    useEffect(() => {
        const fetchDataAndBuildGraph = async () => {
            setIsLoading(true);
            const [datasets, visualizations] = await Promise.all([
                Dataset.list(),
                Visualization.list()
            ]);

            const newNodes = [
                ...datasets.map(d => ({ id: d.id, name: d.name, type: 'dataset' })),
                ...visualizations.map(v => ({ id: v.id, name: v.title, type: v.type || 'visualization' }))
            ];

            const newLinks = visualizations
                .filter(v => v.dataset_id)
                .map(v => ({ source: v.id, target: v.dataset_id }));

            setNodes(newNodes);
            setLinks(newLinks);
            setIsLoading(false);
            
            generateLocalInsights(datasets, visualizations);
        };

        fetchDataAndBuildGraph();
    }, []);

    const generateLocalInsights = (datasets, visualizations) => {
        setIsAiLoading(true);
        try {
            const insights = summarizeProjectStructure({ datasets, visualizations });
            setAiInsights(insights);
        } catch (error) {
            console.error("Ошибка при локальном анализе структуры:", error);
            setAiInsights({ insights: ["Не удалось сформировать локальные рекомендации."] });
        }
        setIsAiLoading(false);
    };

    const getNodeIcon = (node) => {
        const iconMap = {
            dataset: <Database className="w-4 h-4" />,
            line: <BarChart3 className="w-4 h-4" />,
            bar: <BarChart3 className="w-4 h-4" />,
            scatter: <BarChart3 className="w-4 h-4" />,
            area: <BarChart3 className="w-4 h-4" />,
            map: <Map className="w-4 h-4" />,
            forecast: <TrendingUp className="w-4 h-4" />,
            network: <Network className="w-4 h-4" />,
            correlation: <Share2 className="w-4 h-4" />,
            visualization: <Sparkles className="w-4 h-4" />
        };
        return iconMap[node.type] || <Sparkles className="w-4 h-4" />;
    };
    
    // Simple placeholder for graph visualization
    // A proper force simulation is complex and not implemented here.
    return (
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200">
                <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
                    <BrainCircuit className="w-6 h-6 text-purple-500" />
                    Комплексный граф связей проекта
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="w-5 h-5" />
                </Button>
            </CardHeader>
            <CardContent className="p-6 grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <h3 className="text-lg font-semibold mb-4 heading-text">Визуализация связей</h3>
                    <div className="w-full h-[500px] bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-slate-200 p-4 overflow-auto">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-full">
                                <p>Загрузка данных для построения графа...</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {nodes.filter(n => n.type === 'dataset').map(datasetNode => (
                                    <div key={datasetNode.id}>
                                        <div className="flex items-center gap-2 font-bold text-blue-700">
                                            {getNodeIcon(datasetNode)}
                                            <span>{datasetNode.name}</span>
                                        </div>
                                        <div className="pl-8 border-l-2 border-slate-200 ml-2 mt-2 space-y-2">
                                            {links.filter(l => l.target === datasetNode.id).map(link => {
                                                const vizNode = nodes.find(n => n.id === link.source);
                                                return (
                                                    <div key={vizNode.id} className="flex items-center gap-2 text-slate-700">
                                                         {getNodeIcon(vizNode)}
                                                         <span>{vizNode.name}</span>
                                                         <Badge variant="outline" className="text-xs">{vizNode.type}</Badge>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="lg:col-span-1">
                    <h3 className="text-lg font-semibold mb-4 heading-text flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-orange-500" />
                        Локальный анализ структуры
                    </h3>
                    {isAiLoading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-5/6" />
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-4/6" />
                        </div>
                    ) : (
                        <div className="space-y-6 text-sm elegant-text text-slate-700">
                            <div>
                                <h4 className="font-semibold mb-2 text-slate-900">Основные выводы:</h4>
                                <ul className="list-disc list-inside space-y-1">
                                    {aiInsights?.insights?.map((item, i) => <li key={i}>{item}</li>)}
                                </ul>
                            </div>
                             {aiInsights?.key_datasets?.length > 0 && (
                                <div>
                                    <h4 className="font-semibold mb-2 text-slate-900">Ключевые датасеты:</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {aiInsights.key_datasets.map((item, i) => <Badge key={i} variant="secondary">{item}</Badge>)}
                                    </div>
                                </div>
                            )}
                            {aiInsights?.unused_datasets?.length > 0 && (
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <h4 className="font-semibold mb-2 text-yellow-900">Неиспользуемые датасеты:</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {aiInsights.unused_datasets.map((item, i) => <Badge key={i} variant="outline" className="border-yellow-300 bg-white">{item}</Badge>)}
                                    </div>
                                </div>
                            )}
                             {aiInsights?.recommendations?.length > 0 && (
                                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                                    <h4 className="font-semibold mb-2 text-emerald-900">Рекомендации:</h4>
                                     <ul className="list-disc list-inside space-y-1">
                                        {aiInsights.recommendations.map((item, i) => <li key={i}>{item}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
