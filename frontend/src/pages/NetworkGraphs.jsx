import React, { useState, useEffect } from "react";
import { Dataset, Visualization } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Network, Sparkles, BarChart3, Share2 } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";

import NetworkBuilder from "../components/networks/NetworkBuilder";
import NetworkGallery from "../components/networks/NetworkGallery";

export default function NetworkGraphs() {
  const [datasets, setDatasets] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [datasetsData, networksData] = await Promise.all([
        Dataset.list('-created_date'),
        Visualization.filter({ type: 'network' }, '-created_date')
      ]);
      setDatasets(datasetsData);
      setNetworks(networksData);
    } catch (error) {
      console.error('Ошибка загрузки сетевых данных:', error);
    }
    setIsLoading(false);
  };

  const handleSaveNetwork = async (config) => {
    try {
      await Visualization.create({
        title: config.title,
        type: 'network',
        dataset_id: config.dataset_id,
        config: config
      });
      await loadData();
      setShowBuilder(false);
    } catch (error) {
      console.error("Ошибка сохранения сети:", error);
    }
  };

  return (
    <PageContainer className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent heading-text">
            Графы связей данных
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto elegant-text">
            Визуализируйте взаимосвязи в ваших данных с помощью интерактивных графов. Обнаружьте скрытые паттерны и зависимости.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
                <Network className="w-6 h-6 text-white" />
              </div>
              <div className="text-2xl font-bold text-slate-900 heading-text">{networks.length}</div>
              <div className="text-sm text-slate-600 elegant-text">Созданных сетей</div>
            </CardContent>
          </Card>
          
          <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                <Share2 className="w-6 h-6 text-white" />
              </div>
              <div className="text-2xl font-bold text-slate-900 heading-text">
                {datasets.reduce((acc, d) => acc + (d.columns?.length || 0), 0)}
              </div>
              <div className="text-sm text-slate-600 elegant-text">Доступных связей</div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="text-2xl font-bold text-slate-900 heading-text">Локальный анализ</div>
              <div className="text-sm text-slate-600 elegant-text">Анализ связей</div>
            </CardContent>
          </Card>
        </div>

        {showBuilder ? (
          <NetworkBuilder
            datasets={datasets}
            onSave={handleSaveNetwork}
            onCancel={() => setShowBuilder(false)}
          />
        ) : (
          <>
            <div className="text-center">
              <Button
                onClick={() => setShowBuilder(true)}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-8 py-3 text-lg font-medium shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 gap-2 elegant-text"
              >
                <Network className="w-5 h-5" />
                Создать граф связей
              </Button>
            </div>
            <NetworkGallery
              networks={networks}
              isLoading={isLoading}
              onEdit={() => setShowBuilder(true)}
            />
          </>
        )}
    </PageContainer>
  );
}