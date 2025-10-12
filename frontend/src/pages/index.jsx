import Layout from "./Layout.jsx";

import Dashboard from "./Dashboard";

import DataSources from "./DataSources";

import Charts from "./Charts";

import Maps from "./Maps";

import Forecasting from "./Forecasting";

import NetworkGraphs from "./NetworkGraphs";

import Constructor from "./Constructor";

import Settings from "./Settings";

import DataTransformation from "./DataTransformation";

import Assistant from "./Assistant";

import AdvancedAnalytics from "./AdvancedAnalytics";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

const PAGES = {
    
    Dashboard: Dashboard,
    
    DataSources: DataSources,
    
    Charts: Charts,
    
    Maps: Maps,
    
    Forecasting: Forecasting,
    
    NetworkGraphs: NetworkGraphs,
    
    Constructor: Constructor,
    
    Settings: Settings,
    
    DataTransformation: DataTransformation,

    Assistant: Assistant,

    AdvancedAnalytics: AdvancedAnalytics,
    
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>            
                
                    <Route path="/" element={<Dashboard />} />
                
                
                <Route path="/Dashboard" element={<Dashboard />} />
                
                <Route path="/DataSources" element={<DataSources />} />
                
                <Route path="/Charts" element={<Charts />} />
                
                <Route path="/Maps" element={<Maps />} />
                
                <Route path="/Forecasting" element={<Forecasting />} />
                
                <Route path="/NetworkGraphs" element={<NetworkGraphs />} />
                
                <Route path="/Constructor" element={<Constructor />} />
                
                <Route path="/Settings" element={<Settings />} />

                <Route path="/DataTransformation" element={<DataTransformation />} />

                <Route path="/Assistant" element={<Assistant />} />

                <Route path="/AdvancedAnalytics" element={<AdvancedAnalytics />} />

            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}