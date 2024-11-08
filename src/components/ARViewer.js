import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCTNhBokqTimxo-oGstSA8Zw8jIXO3Nhn4",
  authDomain: "app-1238f.firebaseapp.com",
  projectId: "app-1238f",
  storageBucket: "app-1238f.appspot.com",
  messagingSenderId: "12576842624",
  appId: "1:12576842624:web:92eb40fd8c56a9fc475765",
  measurementId: "G-N5Q9K9G3JN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ARViewer = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initAR = async () => {
      try {
        // Get AR data from Firebase
        const querySnapshot = await getDocs(collection(db, 'arExperiences'));
        if (querySnapshot.empty) {
          throw new Error('No AR experiences found');
        }

        const arExperience = querySnapshot.docs[0].data();
        console.log('AR Experience Data:', arExperience); // Debug log

        // Create container for AR scene
        const arContainer = document.createElement('div');
        arContainer.style.width = '100%';
        arContainer.style.height = '100%';
        arContainer.style.position = 'fixed';
        arContainer.style.top = '0';
        arContainer.style.left = '0';
        arContainer.style.zIndex = '1';
        document.body.appendChild(arContainer);

        // Create AR scene
        const scene = document.createElement('a-scene');
        scene.setAttribute('embedded', '');
        scene.setAttribute('arjs', `
          sourceType: webcam;
          debugUIEnabled: false;
          detectionMode: mono_and_matrix;
          matrixCodeType: 3x3;
          patternRatio: 0.75;
          sourceWidth: 1280;
          sourceHeight: 960;
          displayWidth: 1280;
          displayHeight: 960;
        `);
        scene.setAttribute('vr-mode-ui', 'enabled: false');
        scene.setAttribute('renderer', 'antialias: true; alpha: true; precision: medium;');

        // Create assets
        const assets = document.createElement('a-assets');
        const video = document.createElement('video');
        video.id = 'ar-video';
        video.src = arExperience.videoUrl;
        video.setAttribute('preload', 'auto');
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('crossorigin', 'anonymous');
        video.muted = true;
        video.loop = true;
        assets.appendChild(video);

        // Create marker
        const marker = document.createElement('a-marker');
        marker.setAttribute('type', 'pattern');
        marker.setAttribute('url', arExperience.markerUrl);
        marker.setAttribute('preset', 'custom');
        marker.setAttribute('emitevents', 'true');
        marker.setAttribute('smooth', 'true');
        marker.setAttribute('smoothCount', '10');
        marker.setAttribute('smoothTolerance', '0.01');
        marker.setAttribute('raycaster', 'objects: .clickable');

        // Create video entity
        const videoPlane = document.createElement('a-video');
        videoPlane.setAttribute('src', '#ar-video');
        videoPlane.setAttribute('width', '2');
        videoPlane.setAttribute('height', '1.5');
        videoPlane.setAttribute('position', '0 0 0');
        videoPlane.setAttribute('rotation', '-90 0 0');
        videoPlane.classList.add('clickable');
        marker.appendChild(videoPlane);

        // Handle marker events
        marker.addEventListener('markerFound', () => {
          console.log('Marker Found!'); // Debug log
          video.muted = false;
          video.play().catch(error => console.error('Video play error:', error));
          const instructions = document.querySelector('.instructions');
          if (instructions) {
            instructions.style.display = 'none';
          }
        });

        marker.addEventListener('markerLost', () => {
          console.log('Marker Lost!'); // Debug log
          video.pause();
          video.muted = true;
          const instructions = document.querySelector('.instructions');
          if (instructions) {
            instructions.style.display = 'block';
          }
        });

        // Add camera
        const camera = document.createElement('a-entity');
        camera.setAttribute('camera', '');
        
        // Add elements to scene
        scene.appendChild(assets);
        scene.appendChild(marker);
        scene.appendChild(camera);
        arContainer.appendChild(scene);

        // Add debug info
        const debugDiv = document.createElement('div');
        debugDiv.style.position = 'fixed';
        debugDiv.style.top = '10px';
        debugDiv.style.left = '10px';
        debugDiv.style.color = 'white';
        debugDiv.style.zIndex = '1000';
        debugDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
        debugDiv.style.padding = '10px';
        debugDiv.innerHTML = `
          Video URL: ${arExperience.videoUrl}<br>
          Marker URL: ${arExperience.markerUrl}
        `;
        document.body.appendChild(debugDiv);

      } catch (error) {
        console.error('AR setup error:', error);
        setError('Failed to setup AR experience: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

    initAR();

    return () => {
      const arContainer = document.querySelector('div');
      if (arContainer) {
        arContainer.remove();
      }
    };
  }, []);

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
        Point your camera at the marker image
      </Instructions>
    </Container>
  );
};

// Styled Components
const Container = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 1;

  & > div {
    z-index: 1;
  }

  .a-canvas {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    z-index: 0 !important;
  }
`;

const Instructions = styled.div`
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 15px 25px;
  border-radius: 25px;
  font-size: 16px;
  text-align: center;
  z-index: 2;
  width: 80%;
  max-width: 400px;
  pointer-events: none;
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