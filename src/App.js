import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ARViewer from './components/ARViewer';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ARViewer />} />
      </Routes>
    </Router>
  );
}
export default App;