// ARViewer.js
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

// Styled Components
const Container = styled.div`
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
  background-color: #000;
`;

const LoadingContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const LoadingText = styled.div`
  color: white;
  font-size: 24px;
  margin-bottom: 20px;
  text-align: center;
  padding: 0 20px;
`;

const Spinner = styled.div`
  width: 50px;
  height: 50px;
  border: 5px solid #f3f3f3;
  border-top: 5px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
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
  z-index: 100;
  width: 80%;
  max-width: 400px;
`;

const ErrorContainer = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 0, 0, 0.9);
  color: white;
  padding: 20px;
  border-radius: 10px;
  text-align: center;
  max-width: 80%;
  z-index: 1000;
`;

const RetryButton = styled.button`
  background: white;
  color: red;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  margin-top: 15px;
  cursor: pointer;
  font-size: 16px;

  &:hover {
    background: #f0f0f0;
  }
`;

function ARViewer() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Initialize Firebase
    const app = initializeApp({
        apiKey: "AIzaSyCTNhBokqTimxo-oGstSA8Zw8jIXO3Nhn4",
  authDomain: "app-1238f.firebaseapp.com",
  projectId: "app-1238f",
  storageBucket: "app-1238f.appspot.com",
  messagingSenderId: "12576842624",
  appId: "1:12576842624:web:92eb40fd8c56a9fc475765",
  measurementId: "G-N5Q9K9G3JN"
    });
    const db = getFirestore(app);

    const initAR = async () => {
      const experienceId = searchParams.get('id');
      
      if (!experienceId) {
        setError('No AR experience ID provided');
        setLoading(false);
        return;
      }

      try {
        // Load required scripts
        await Promise.all([
          loadScript('https://aframe.io/releases/1.2.0/aframe.min.js'),
          loadScript('https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js')
        ]);

        // Get AR experience data
        const docRef = doc(db, 'arExperiences', experienceId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          throw new Error('AR experience not found');
        }

        const data = docSnap.data();
        setupARScene(data);
      } catch (err) {
        console.error('AR initialization error:', err);
        setError(err.message || 'Failed to load AR experience');
      } finally {
        setLoading(false);
      }
    };

    initAR();

    // Cleanup function
    return () => {
      const scene = document.querySelector('a-scene');
      if (scene) {
        scene.remove();
      }
    };
  }, [searchParams]);

  const loadScript = (url) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
      document.head.appendChild(script);
    });
  };

  const setupARScene = (data) => {
    // Create AR Scene
    const scene = document.createElement('a-scene');
    scene.setAttribute('embedded', '');
    scene.setAttribute('arjs', 'sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix;');
    scene.setAttribute('vr-mode-ui', 'enabled: false');
    scene.setAttribute('renderer', 'logarithmicDepthBuffer: true; precision: medium;');

    // Create assets
    const assets = document.createElement('a-assets');
    const video = document.createElement('video');
    video.id = 'arVideo';
    video.src = data.videoUrl;
    video.setAttribute('preload', 'auto');
    video.setAttribute('crossorigin', 'anonymous');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('loop', 'true');
    assets.appendChild(video);
    scene.appendChild(assets);

    // Create marker
    const marker = document.createElement('a-marker');
    marker.setAttribute('preset', 'custom');
    marker.setAttribute('type', 'pattern');
    marker.setAttribute('url', data.markerUrl);
    marker.setAttribute('smooth', 'true');
    marker.setAttribute('smoothCount', '5');

    // Create video entity
    const videoEntity = document.createElement('a-video');
    videoEntity.setAttribute('src', '#arVideo');
    videoEntity.setAttribute('position', '0 0 0');
    videoEntity.setAttribute('rotation', '-90 0 0');
    videoEntity.setAttribute('width', '2');
    videoEntity.setAttribute('height', '1.5');
    marker.appendChild(videoEntity);

    // Handle marker detection
    marker.addEventListener('markerFound', () => {
      video.play().catch(console.error);
      const instructions = document.querySelector('.instructions');
      if (instructions) {
        instructions.style.display = 'none';
      }
    });

    marker.addEventListener('markerLost', () => {
      video.pause();
      const instructions = document.querySelector('.instructions');
      if (instructions) {
        instructions.style.display = 'block';
      }
    });

    // Add camera entity
    const camera = document.createElement('a-entity');
    camera.setAttribute('camera', '');
    scene.appendChild(marker);
    scene.appendChild(camera);

    // Add scene to document
    document.body.appendChild(scene);
  };

  if (loading) {
    return (
      <LoadingContainer>
        <Spinner />
        <LoadingText>Loading AR Experience</LoadingText>
        <LoadingText>Please allow camera access when prompted</LoadingText>
      </LoadingContainer>
    );
  }

  if (error) {
    return (
      <ErrorContainer>
        <div>{error}</div>
        <RetryButton onClick={() => window.location.reload()}>
          Try Again
        </RetryButton>
      </ErrorContainer>
    );
  }

  return (
    <Container>
      <Instructions className="instructions">
        Point your camera at the marker to view AR content
      </Instructions>
    </Container>
  );
}

export default ARViewer;