// App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ARViewer from './components/ARViewer';
import Home from './components/Home';
import styled from 'styled-components';

function App() {
  return (
    <AppContainer>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/view" element={<ARViewer />} />
        </Routes>
      </Router>
    </AppContainer>
  );
}

const AppContainer = styled.div`
  min-height: 100vh;
  background-color: #1a1a1a;
  color: white;
`;

export default App;