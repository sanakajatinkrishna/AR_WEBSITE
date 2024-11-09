// components/ARViewer.js
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';

const ARViewer = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initAR = async () => {
      try {
        // Request camera permission
        await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } 
        });

        // Load required scripts
        await Promise.all([
          loadScript('https://aframe.io/releases/1.4.0/aframe.min.js'),
          loadScript('https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js')
        ]);

        // Setup AR Scene
        setupARScene();
        setLoading(false);
      } catch (err) {
        console.error('AR initialization error:', err);
        setError('Please allow camera access and refresh the page');
        setLoading(false);
      }
    };

    initAR();

    return () => {
      const scene = document.querySelector('a-scene');
      if (scene) scene.parentNode.removeChild(scene);
    };
  }, []);

  const loadScript = (url) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  const setupARScene = () => {
    // Create scene
    const scene = document.createElement('a-scene');
    scene.setAttribute('embedded', '');
    scene.setAttribute('arjs', `
      sourceType: webcam;
      debugUIEnabled: false;
      detectionMode: mono_and_matrix;
      matrixCodeType: 3x3;
      sourceWidth: 1280;
      sourceHeight: 720;
      displayWidth: 1280;
      displayHeight: 720;
    `);
    scene.setAttribute('vr-mode-ui', 'enabled: false');
    scene.setAttribute('renderer', 'antialias: true; alpha: true');

    // Create assets
    const assets = document.createElement('a-assets');
    const video = document.createElement('video');
    video.id = 'video';
    video.src = 'path_to_your_video.mp4'; // Replace with your video URL
    video.setAttribute('preload', 'auto');
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('crossorigin', 'anonymous');
    video.muted = true;
    assets.appendChild(video);
    scene.appendChild(assets);

    // Create marker
    const marker = document.createElement('a-marker');
    marker.setAttribute('preset', 'hiro'); // Using default Hiro marker for testing
    marker.setAttribute('emitevents', 'true');
    marker.setAttribute('smooth', 'true');
    marker.setAttribute('smoothCount', '5');

    // Create video plane
    const videoPlane = document.createElement('a-video');
    videoPlane.setAttribute('src', '#video');
    videoPlane.setAttribute('position', '0 0 0');
    videoPlane.setAttribute('rotation', '-90 0 0');
    videoPlane.setAttribute('width', '2');
    videoPlane.setAttribute('height', '1.5');
    marker.appendChild(videoPlane);

    // Marker event handlers
    marker.addEventListener('markerFound', () => {
      video.play().catch(console.error);
      video.muted = false;
      const instructions = document.querySelector('.instructions');
      if (instructions) instructions.style.display = 'none';
    });

    marker.addEventListener('markerLost', () => {
      video.pause();
      video.muted = true;
      const instructions = document.querySelector('.instructions');
      if (instructions) instructions.style.display = 'block';
    });

    // Add camera
    const camera = document.createElement('a-entity');
    camera.setAttribute('camera', '');

    // Append elements to scene
    scene.appendChild(marker);
    scene.appendChild(camera);
    document.body.appendChild(scene);

    // Enable video on user interaction
    document.addEventListener('click', () => {
      video.play().catch(console.error);
    }, { once: true });
  };

  return (
    <Container>
      {loading && <LoadingScreen>Loading AR Experience...</LoadingScreen>}
      {error && (
        <ErrorContainer>
          <ErrorText>{error}</ErrorText>
          <RetryButton onClick={() => window.location.reload()}>
            Try Again
          </RetryButton>
        </ErrorContainer>
      )}
      <Instructions className="instructions">
        Point your camera at a Hiro marker to view AR content
        <DownloadLink href="https://raw.githubusercontent.com/AR-js-org/AR.js/master/data/images/HIRO.jpg" 
                     target="_blank"
                     rel="noopener noreferrer">
          Download Hiro Marker
        </DownloadLink>
      </Instructions>
    </Container>
  );
};

const Container = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
`;

const Instructions = styled.div`
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 20px;
  border-radius: 10px;
  text-align: center;
  z-index: 2;
  width: 90%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const DownloadLink = styled.a`
  color: #2196F3;
  text-decoration: none;
  font-weight: bold;
  
  &:hover {
    text-decoration: underline;
  }
`;

const LoadingScreen = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 20px;
  z-index: 999;
`;

const ErrorContainer = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.8);
  padding: 20px;
  border-radius: 10px;
  text-align: center;
  color: white;
  z-index: 999;
`;

const ErrorText = styled.div`
  margin-bottom: 20px;
`;

const RetryButton = styled.button`
  background: #2196F3;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  
  &:hover {
    background: #1976D2;
  }
`;

export default ARViewer;