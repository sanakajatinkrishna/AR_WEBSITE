import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ARViewer from './components/ARViewer';
import NotFound from './components/NotFound';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/viewer" element={<ARViewer />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;